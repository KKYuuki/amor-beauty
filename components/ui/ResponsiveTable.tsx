"use client"

import { ReactNode, useMemo, KeyboardEvent } from "react"
import { motion, AnimatePresence } from "motion/react"
import { LoaderCircleIcon, InboxIcon } from "lucide-react"
import { Surfaces } from "@/components/ui/design-system"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

interface Column<T = AnyRecord> {
    key: keyof T | string
    header: string
    render?: (value: unknown, row: T) => ReactNode
    mobileCard?: {
        label: string
        priority?: "primary" | "secondary" | "tertiary"
        render?: (value: unknown, row: T) => ReactNode
    }
    hideOnMobile?: boolean
}

interface MobileCardProps<T = AnyRecord> {
    columns: Column<T>[]
    data: T
    onClick?: () => void
    className?: string
}

interface ResponsiveTableProps<T = AnyRecord> {
    columns: Column<T>[]
    data: T[]
    onRowClick?: (row: T) => void
    emptyMessage?: string
    loading?: boolean
    mobileCardClassName?: string
    desktopMinWidth?: string
    rowKey?: keyof T
    tableAriaLabel?: string
}

interface TableCellProps<T = AnyRecord> {
    column: Column<T>
    row: T
}

function TableCell<T = AnyRecord>({ column, row }: TableCellProps<T>) {
    const value = (row as AnyRecord)[column.key as string]

    if (column.render) {
        return <>{column.render(value, row)}</>
    }

    if (value !== null && value !== undefined) {
        return <>{String(value)}</>
    }

    return <span className='text-muted-foreground/70'>-</span>
}

function MobileCard<T = AnyRecord>({ columns, data, onClick, className = "" }: MobileCardProps<T>) {
    const visibleColumns = columns.filter((col) => !col.hideOnMobile)

    const primaryFields = visibleColumns.filter(
        (col) => col.mobileCard?.priority === "primary"
    )
    const secondaryFields = visibleColumns.filter(
        (col) => col.mobileCard?.priority === "secondary"
    )
    const tertiaryFields = visibleColumns.filter(
        (col) =>
            !col.mobileCard?.priority || col.mobileCard?.priority === "tertiary"
    )

    const renderField = (col: Column<T>) => {
        const value = (data as AnyRecord)[col.key as string]
        const renderFn = col.mobileCard?.render || col.render

        if (renderFn) {
            return renderFn(value, data)
        }

        if (value === null || value === undefined || value === "") {
            return <span className='text-muted-foreground/70'>-</span>
        }

        return <span>{String(value)}</span>
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && onClick) {
            onClick()
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            className={`
                ${Surfaces.card} p-4
                ${onClick ? "cursor-pointer hover:bg-muted active:bg-muted" : ""}
                transition-colors min-h-[44px]
                ${className}
            `}
        >
            {primaryFields.length > 0 && (
                <div className="mb-3">
                    {primaryFields.map((col) => (
                        <div key={String(col.key)} className="mb-1 last:mb-0">
                            <div className="text-lg font-semibold text-foreground">
                                {renderField(col)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {secondaryFields.length > 0 && (
                <div className="mb-3 space-y-1">
                    {secondaryFields.map((col) => (
                        <div key={String(col.key)} className="flex items-start gap-2">
                            <span className="text-sm text-muted-foreground shrink-0">
                                {col.mobileCard?.label || col.header}:
                            </span>
                            <span className="text-sm text-foreground">
                                {renderField(col)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {tertiaryFields.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-border">
                    {tertiaryFields.map((col) => (
                        <div key={String(col.key)} className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground/70">
                                {col.mobileCard?.label || col.header}:
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {renderField(col)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}

export default function ResponsiveTable<T = AnyRecord>({
    columns,
    data,
    onRowClick,
    emptyMessage = "No data available",
    loading = false,
    mobileCardClassName = "",
    desktopMinWidth = "min-w-max",
    rowKey,
    tableAriaLabel = "Data table",
}: ResponsiveTableProps<T>) {
    const desktopColumns = columns
    const mobileColumns = useMemo(
        () => columns.filter((col) => !col.hideOnMobile),
        [columns]
    )

    const handleRowClick = (row: T) => () => {
        onRowClick?.(row)
    }

    const handleRowKeyDown = (row: T) => (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.key === "Enter" && onRowClick) {
            onRowClick(row)
        }
    }

    const getRowKey = (row: T, index: number): string | number => {
        if (rowKey) {
            const keyValue = (row as AnyRecord)[rowKey as string]
            if (keyValue !== null && keyValue !== undefined) {
                return String(keyValue)
            }
        }
        return index
    }

    return (
        <div className="w-full">
            <div className="hidden md:block overflow-x-auto">
                <table
                    className={`${desktopMinWidth} w-full table-auto border-collapse`}
                    aria-label={tableAriaLabel}
                >
                    <caption className="sr-only">{tableAriaLabel}</caption>
                    <thead className="bg-muted sticky top-0 z-10">
                        <tr>
                            {desktopColumns.map((col) => (
                                <th
                                    key={String(col.key)}
                                    scope="col"
                                    className='text-left px-4 py-3 text-sm text-foreground font-bold uppercase border-b border-border'
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td
                                    colSpan={desktopColumns.length}
                                    className="p-8 text-center text-muted-foreground"
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <LoaderCircleIcon className="w-8 h-8 animate-spin text-muted-foreground" />
                                        <span>Loading...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={desktopColumns.length}
                                    className="p-8 text-center text-muted-foreground"
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <InboxIcon className="w-12 h-12 text-muted-foreground/70" />
                                        <span className="italic">{emptyMessage}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            <AnimatePresence mode="wait">
                                {data.map((row, index) => (
                                    <motion.tr
                                        key={getRowKey(row, index)}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15, delay: index * 0.02 }}
                                        onClick={handleRowClick(row)}
                                        onKeyDown={handleRowKeyDown(row)}
                                        tabIndex={onRowClick ? 0 : undefined}
                                        role={onRowClick ? "button" : undefined}
                                        className={`
                                            border-b border-border
                                            ${onRowClick ? "cursor-pointer hover:bg-muted" : ""}
                                            transition-colors
                                        `}
                                    >
                                        {desktopColumns.map((col) => (
                                            <td
                                                key={String(col.key)}
                                                className='px-4 py-3 text-sm text-foreground'
                                            >
                                                <TableCell column={col} row={row} />
                                            </td>
                                        ))}
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                        <LoaderCircleIcon className="w-8 h-8 animate-spin" />
                        <span>Loading...</span>
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                        <InboxIcon className="w-12 h-12 text-muted-foreground/70" />
                        <span className="italic">{emptyMessage}</span>
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {data.map((row, index) => (
                            <MobileCard
                                key={getRowKey(row, index)}
                                columns={mobileColumns}
                                data={row}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                className={mobileCardClassName}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    )
}

export { MobileCard }
export type { Column, ResponsiveTableProps, MobileCardProps }
