import {
    GroupingDimension,
    GroupingConfig,
    LedgerExportRow,
    GroupedEntryGroup,
    GroupTotals,
    BranchInfo,
} from './types'
import { getAccountingPaymentMethodLabel } from '@/utils/types/payment'

const DIMENSION_LABELS: Record<GroupingDimension, string> = {
    branch: 'Branch',
    entryType: 'Accounting Type',
    paymentMethod: 'Payment Method',
    category: 'Category',
    rateLevel: 'Rate Level',
    staffCut: 'Staff Cut',
}

export function getGroupKey(
    entry: LedgerExportRow,
    dimension: GroupingDimension
): string {
    switch (dimension) {
        case 'branch':
            return entry.branch || 'Shared'
        case 'entryType':
            return entry.type
        case 'paymentMethod':
            return entry.payment_method || 'Unspecified'
        case 'category':
            return entry.category || 'Uncategorized'
        case 'rateLevel':
            return entry.rate_level_name || 'Unknown'
        case 'staffCut':
            return entry.staff_cut && entry.staff_cut > 0 ? 'Staff' : 'Shop'
    }
}

export function getGroupLabel(
    key: string,
    dimension: GroupingDimension,
    branches?: BranchInfo[]
): string {
    switch (dimension) {
        case 'branch': {
            const branch = branches?.find(b =>
                b.name === key || b.code === key
            )
            return branch ? `${branch.code} - ${branch.name}` : key
        }
        case 'entryType':
            return formatEntryType(key)
        case 'paymentMethod':
            return getAccountingPaymentMethodLabel(key)
        case 'category':
            return key
        case 'rateLevel':
            return key
        case 'staffCut':
            return key === 'Staff' ? 'Staff Cut Entries' : 'Shop Cut Entries'
    }
}

function formatEntryType(type: string): string {
    const labels: Record<string, string> = {
        EXPENSE: 'Expenses',
        REVENUE: 'Revenue',
        ASSET: 'Assets',
        LIABILITY: 'Liabilities',
        EQUITY: 'Equity',
    }
    return labels[type] || type
}

export function computeGroupTotals(entries: LedgerExportRow[]): GroupTotals {
    let totalDebit = 0
    let totalCredit = 0

    for (const entry of entries) {
        totalDebit += entry.debit
        totalCredit += entry.credit
    }

    return {
        totalDebit,
        totalCredit,
        netAmount: totalDebit - totalCredit,
        entryCount: entries.length,
    }
}

export function groupEntries(
    entries: LedgerExportRow[],
    config: GroupingConfig,
    branches?: BranchInfo[]
): GroupedEntryGroup[] {
    if (config.dimensions.length === 0) {
        return [{
            key: 'all',
            label: 'All Entries',
            entries,
            totals: computeGroupTotals(entries),
        }]
    }

    const primaryDimension = config.dimensions[0]
    return groupByDimension(entries, primaryDimension, branches, config.dimensions.slice(1))
}

function groupByDimension(
    entries: LedgerExportRow[],
    dimension: GroupingDimension,
    branches: BranchInfo[] | undefined,
    remainingDimensions: GroupingDimension[]
): GroupedEntryGroup[] {
    const groups = new Map<string, LedgerExportRow[]>()

    for (const entry of entries) {
        const key = getGroupKey(entry, dimension)
        if (!groups.has(key)) {
            groups.set(key, [])
        }
        groups.get(key)!.push(entry)
    }

    const sortedKeys = sortGroupKeys(Array.from(groups.keys()), dimension)

    return sortedKeys.map(key => {
        const groupEntries = groups.get(key)!
        const label = getGroupLabel(key, dimension, branches)
        const totals = computeGroupTotals(groupEntries)

        const subGroups = remainingDimensions.length > 0
            ? groupByDimension(groupEntries, remainingDimensions[0], branches, remainingDimensions.slice(1))
            : undefined

        return {
            key,
            label,
            entries: groupEntries,
            subGroups,
            totals,
        }
    })
}

function sortGroupKeys(keys: string[], dimension: GroupingDimension): string[] {
    const typeOrder = ['REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY']

    switch (dimension) {
        case 'entryType':
            return keys.sort((a, b) => {
                const ai = typeOrder.indexOf(a)
                const bi = typeOrder.indexOf(b)
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
            })
        case 'branch':
            return keys.sort((a, b) => {
                if (a === 'Shared') return 1
                if (b === 'Shared') return -1
                return a.localeCompare(b)
            })
        case 'paymentMethod':
        case 'category':
        case 'rateLevel':
        case 'staffCut':
        default:
            return keys.sort()
    }
}

export function getSheetName(
    group: GroupedEntryGroup,
    dimension: GroupingDimension | undefined,
    existingNames: Set<string>
): string {
    const baseName = dimension
        ? `${DIMENSION_LABELS[dimension]}: ${group.label}`
        : group.label

    let sheetName = baseName.substring(0, 31)

    let counter = 1
    while (existingNames.has(sheetName)) {
        const suffix = ` (${counter})`
        sheetName = baseName.substring(0, 31 - suffix.length) + suffix
        counter++
    }

    existingNames.add(sheetName)
    return sheetName
}

export function flattenGroups(
    groups: GroupedEntryGroup[],
    depth: number = 0
): { group: GroupedEntryGroup; depth: number }[] {
    const result: { group: GroupedEntryGroup; depth: number }[] = []

    for (const group of groups) {
        result.push({ group, depth })
        if (group.subGroups) {
            result.push(...flattenGroups(group.subGroups, depth + 1))
        }
    }

    return result
}