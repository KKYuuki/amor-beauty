'use server'

import { eq, and, gte, lte, sql, desc, asc, isNull, or, SQL, count } from 'drizzle-orm'

import { db } from '@/server/db'
import { generalLedger, inventory, ratings, reviews, user, payrollEntry, transactions } from '@/server/db/schema'
import { appointments } from '@/server/db/schema/appointments'
import { rateLevels } from '@/server/db/schema/rate-levels'
import { getCurrentUser, canAccessAccounting, canViewMetrics } from '@/utils/auth/permissions'
import type { MetricsExportFormat } from '@/utils/metrics-export-utils'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import {
    generateGroupedMetricsExport,
} from '@/utils/export-engine'
import type {
    GroupingConfig,
    GroupedExportOptions,
    ExportFormat,
    ExportResult,
    MetricsExportRow,
} from '@/utils/export-engine/types'

import { createLogs } from './logs'

const LEADERBOARD_LIMIT = 20

export type FinancialMetrics = {
    revenue: number
    transactions: number
    averageTicket: number
}

export type RevenueTrend = {
    date: string
    revenue: number
}[]

export type OperationalMetrics = {
    totalAppointments: number
    completedAppointments: number
    cancelledAppointments: number
    cancellationRate: number
}

export type InventoryMetrics = {
    totalValue: number
    potentialRevenue: number
    topSelling: {
        name: string
        quantity: number
        revenue: number
    }[]
}

export type RatingMetrics = {
    averageRating: number
    totalRatings: number
    distribution: {
        rating: number
        count: number
    }[]
}

export type StaffPerformanceMetric = {
    staff_id: string
    staff_name: string
    average_rating: number
    total_ratings: number
    sum_of_ratings: number
    rating_distribution: {
        1: number
        2: number
        3: number
        4: number
        5: number
    }
    appointments_completed: number
}

export async function getScopedFinancialMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _paymentMethod?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<FinancialMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
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
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))

        let revenue = 0

        entries.forEach((entry) => {
            const debit = Number(entry.debit) || 0
            const credit = Number(entry.credit) || 0
            revenue += credit - debit
        })

        const metrics = {
            revenue,
            transactions: entries.length,
            averageTicket: entries.length > 0 ? revenue / entries.length : 0,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching scoped financial metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch financial metrics')
    }
}

export async function getFinancialMetrics(branchId?: string): Promise<ActionResponse<FinancialMetrics>> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    return getScopedFinancialMetrics(
        startOfMonth.toISOString().split('T')[0],
        endOfMonth.toISOString().split('T')[0],
        branchId
    )
}

export async function getRevenueTrend(
    startDate: string,
    endDate: string,
    groupBy: "day" | "month" = "day",
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<RevenueTrend>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
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
                entryDate: generalLedger.entryDate,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .orderBy(desc(generalLedger.entryDate))

        const grouped = new Map<string, number>()

        entries.forEach((entry) => {
            const date = new Date(entry.entryDate)
            let key: string

            if (groupBy === 'month') {
                key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            } else {
                key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }

            const current = grouped.get(key) || 0
            const debit = Number(entry.debit) || 0
            const credit = Number(entry.credit) || 0
            grouped.set(key, current + (credit - debit))
        })

        const trend = Array.from(grouped.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .reverse()

        return success(trend)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching revenue trend: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch revenue trend')
    }
}

export async function getOperationalMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<OperationalMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(appointments.isActive, true),
            gte(appointments.timeStart, start),
            lte(appointments.timeStart, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const appointmentData = await db
            .select({
                status: appointments.status,
            })
            .from(appointments)
            .where(and(...conditions))

        const totalAppointments = appointmentData.length
        const completedAppointments = appointmentData.filter(a => a.status === 'COMPLETED').length
        const cancelledAppointments = appointmentData.filter(a => a.status === 'CANCELLED').length

        const cancellationRate = totalAppointments > 0
            ? (cancelledAppointments / totalAppointments) * 100
            : 0

        const metrics = {
            totalAppointments,
            completedAppointments,
            cancelledAppointments,
            cancellationRate,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching operational metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch operational metrics')
    }
}

export async function getInventoryMetrics(
    _startDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<InventoryMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const conditions: SQL<unknown>[] = [eq(inventory.isActive, true)]

        if (branchId) {
            const branchCondition = or(eq(inventory.branchId, branchId!), isNull(inventory.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const items = await db
            .select({
                name: inventory.name,
                currentStock: inventory.currentStock,
                unitPrice: inventory.unitPrice,
                sellingPrice: inventory.sellingPrice,
            })
            .from(inventory)
            .where(and(...conditions))

        let totalValue = 0
        let potentialRevenue = 0

        items.forEach((item) => {
            const quantity = Number(item.currentStock) || 0
            const cost = Number(item.unitPrice) || 0
            const price = Number(item.sellingPrice) || 0

            totalValue += cost * quantity
            potentialRevenue += price * quantity
        })

        const topSelling = items
            .map((item) => ({
                name: item.name || "Unknown",
                quantity: Number(item.currentStock) || 0,
                revenue: (Number(item.sellingPrice) || 0) * (Number(item.currentStock) || 0),
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)

        const metrics = {
            totalValue,
            potentialRevenue,
            topSelling,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching inventory metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch inventory metrics')
    }
}

export async function getRatingMetrics(
    branchId?: string,
    startDate?: string,
    endDate?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<RatingMetrics>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        const conditions: SQL<unknown>[] = []

        if (startDate) {
            conditions.push(gte(ratings.createdAt, new Date(startDate)))
        }

        if (endDate) {
            conditions.push(lte(ratings.createdAt, new Date(endDate)))
        }

        let allRatings

        if (branchId) {
            allRatings = await db
                .select({
                    rating: ratings.rating,
                })
                .from(ratings)
                .innerJoin(appointments, eq(ratings.appointmentId, appointments.id))
                .where(
                    conditions.length > 0
                        ? and(
                            or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)),
                            ...conditions
                        )
                        : or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
                )
        } else {
            allRatings = await db
                .select({
                    rating: ratings.rating,
                })
                .from(ratings)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
        }

        if (allRatings.length === 0) {
            return success({
                averageRating: 0,
                totalRatings: 0,
                distribution: [],
            })
        }

        const totalRatings = allRatings.length
        const averageRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings

        // Calculate distribution
        const distribution = [1, 2, 3, 4, 5].map(rating => ({
            rating,
            count: allRatings.filter(r => r.rating === rating).length,
        }))

        const metrics = {
            averageRating: Math.round(averageRating * 10) / 10,
            totalRatings,
            distribution,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to get rating metrics: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure('Failed to get rating metrics')
    }
}

export async function getStaffPerformance(
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<StaffPerformanceMetric[]>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        const hasAccess = await canViewMetrics(currentUser)
        if (!hasAccess) {
            return failure('Access denied')
        }

        const appointmentConditions: SQL<unknown>[] = [
            eq(appointments.status, 'COMPLETED'),
        ]

        if (branchId) {
            const branchCondition = or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
            if (branchCondition) appointmentConditions.push(branchCondition)
        }

        // Get staff who have appointments but no ratings yet
        const staffWithAppointments = await db
            .select({
                staff_id: appointments.staffId,
                staff_name: user.fullName,
                appointment_count: sql<number>`count(*)`.as('appointment_count'),
            })
            .from(appointments)
            .innerJoin(user, eq(appointments.staffId, user.id))
            .where(and(...appointmentConditions))
            .groupBy(appointments.staffId, user.fullName)

        // For ratings, we need to join through appointments to filter by branch
        const ratingsWithBranchFilter = branchId
            ? db
                .select({
                    staff_id: ratings.staffId,
                    staff_name: user.fullName,
                    rating: ratings.rating,
                })
                .from(ratings)
                .innerJoin(user, eq(ratings.staffId, user.id))
                .innerJoin(appointments, eq(ratings.appointmentId, appointments.id))
                .where(or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))
            : db
                .select({
                    staff_id: ratings.staffId,
                    staff_name: user.fullName,
                    rating: ratings.rating,
                })
                .from(ratings)
                .innerJoin(user, eq(ratings.staffId, user.id))

        const staffRatings = await ratingsWithBranchFilter

        // Aggregate ratings per staff
        const performanceMap = new Map<string, StaffPerformanceMetric>()

        // Initialize with all staff who have completed appointments
        for (const staff of staffWithAppointments) {
            if (staff.staff_id) {
                performanceMap.set(staff.staff_id, {
                    staff_id: staff.staff_id,
                    staff_name: staff.staff_name || 'Unknown',
                    average_rating: 0,
                    total_ratings: 0,
                    sum_of_ratings: 0,
                    rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    appointments_completed: staff.appointment_count || 0,
                })
            }
        }

        // Process ratings
        for (const rating of staffRatings) {
            const existing = performanceMap.get(rating.staff_id)
            if (existing) {
                existing.total_ratings++
                existing.sum_of_ratings += rating.rating
                existing.average_rating = existing.sum_of_ratings / existing.total_ratings
                // Validate rating before using as index
                if (rating.rating >= 1 && rating.rating <= 5) {
                    existing.rating_distribution[rating.rating as 1 | 2 | 3 | 4 | 5]++
                }
            } else {
                // Staff has ratings but no completed appointments (shouldn't happen normally)
                performanceMap.set(rating.staff_id, {
                    staff_id: rating.staff_id,
                    staff_name: rating.staff_name || 'Unknown',
                    average_rating: rating.rating,
                    total_ratings: 1,
                    sum_of_ratings: rating.rating,
                    rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    appointments_completed: 0,
                })
                const newEntry = performanceMap.get(rating.staff_id)!
                if (rating.rating >= 1 && rating.rating <= 5) {
                    newEntry.rating_distribution[rating.rating as 1 | 2 | 3 | 4 | 5] = 1
                }
            }
        }

        const result = Array.from(performanceMap.values())

        return success(result)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to get staff performance: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure('Failed to get staff performance')
    }
}

export type NetIncomeMetrics = {
    revenue: number
    expenses: number
    netIncome: number
}

export async function getNetIncomeMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<NetIncomeMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const entries = await db
            .select({
                entryType: generalLedger.entryType,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))

        let revenue = 0
        let expenses = 0

        entries.forEach((entry) => {
            const debit = Number(entry.debit) || 0
            const credit = Number(entry.credit) || 0
            if (entry.entryType === 'REVENUE') {
                revenue += credit - debit
            } else if (entry.entryType === 'EXPENSE') {
                expenses += debit - credit
            }
        })

        const netIncome = revenue - expenses

        const metrics = { revenue, expenses, netIncome }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to get net income metrics: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure('Failed to get net income metrics')
    }
}

export type ClientTypeMetrics = {
    walkinCount: number
    personalCount: number
}

export async function getClientTypeMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<ClientTypeMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(appointments.isActive, true),
            gte(appointments.timeStart, start),
            lte(appointments.timeStart, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const appointmentData = await db
            .select({
                isWalkin: appointments.isWalkin,
            })
            .from(appointments)
            .where(and(...conditions))

        const walkinCount = appointmentData.filter(a => a.isWalkin).length
        const personalCount = appointmentData.length - walkinCount

        const metrics = { walkinCount, personalCount }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching client type metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch client type metrics')
    }
}

export type StaffLeaderboardEntry = {
    staff_id: string
    full_name: string
    avatar_url?: string
    rate_level_id?: string
    rate_level_name?: string
    total_gross: number
    total_staff_cut: number
    appointment_count: number
}

export async function getStaffLeaderboard(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<StaffLeaderboardEntry[]>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(currentUser)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            gte(payrollEntry.serviceDate, start),
            lte(payrollEntry.serviceDate, end),
        ]

        // Note: payroll_entry does not have a branchId column, so branch filtering
        // must go through the related transaction (via transactionId foreign key).
        // This uses an EXISTS subquery on transactions rather than a direct column check.
        if (branchId) {
            conditions.push(
                sql`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.id} = ${payrollEntry.transactionId} AND (${transactions.branchId} = ${branchId} OR ${transactions.branchId} IS NULL))`
            )
        }

        conditions.push(
            or(
                eq(user.role, "artist"),
                and(eq(user.role, "admin"), sql`COALESCE(${user.accessFlags}, '[]'::jsonb)::jsonb ? 'artist'`)
            )!
        )

        const entries = await db
            .select({
                staffId: payrollEntry.staffId,
                staffFullName: user.fullName,
                staffAvatarUrl: user.avatarUrl,
                staffRateLevelId: user.rateLevelId,
                rateLevelName: rateLevels.name,
                totalStaffCut: sql<number>`COALESCE(SUM(CAST(${payrollEntry.staffCut} AS NUMERIC)), 0)`,
                totalGross: sql<number>`COALESCE(SUM(CAST(${payrollEntry.grossAmount} AS NUMERIC)), 0)`,
                appointmentCount: sql<number>`CAST(COUNT(DISTINCT ${payrollEntry.appointmentId}) AS INTEGER)`,
            })
            .from(payrollEntry)
            .leftJoin(user, eq(payrollEntry.staffId, user.id))
            .leftJoin(rateLevels, eq(user.rateLevelId, rateLevels.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(payrollEntry.staffId, user.fullName, user.avatarUrl, user.rateLevelId, rateLevels.name)
            .orderBy(desc(sql`COALESCE(SUM(CAST(${payrollEntry.staffCut} AS NUMERIC)), 0)`))

        const leaderboard: StaffLeaderboardEntry[] = entries.slice(0, LEADERBOARD_LIMIT).map(entry => ({
            staff_id: entry.staffId,
            full_name: entry.staffFullName || 'Unknown',
            avatar_url: entry.staffAvatarUrl || undefined,
            rate_level_id: entry.staffRateLevelId || undefined,
            rate_level_name: entry.rateLevelName || undefined,
            total_staff_cut: Number(entry.totalStaffCut) || 0,
            total_gross: Number(entry.totalGross) || 0,
            appointment_count: entry.appointmentCount || 0,
        }))

        return success(leaderboard)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching staff leaderboard: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff leaderboard')
    }
}

export type AppointmentReview = {
    id: string
    appointment_id?: string
    author_id: string
    type: 'ARTIST' | 'SHOP' | 'SERVICE'
    title?: string
    content: string
    is_public: boolean
    created_at: string
}

export interface AppointmentReviewsResult {
    data: AppointmentReview[]
    hasMore: boolean
    total: number
}

export async function getAppointmentReviews(
    appointmentId?: string,
    options?: { page?: number; pageSize?: number },
    branchId?: string
): Promise<ActionResponse<{ data: AppointmentReview[]; hasMore: boolean; total: number }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canViewMetrics(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const { page = 1, pageSize = 10 } = options || {}
        const offset = (page - 1) * pageSize

        let countQuery, dataQuery

        if (appointmentId) {
            countQuery = db
                .select({ count: count() })
                .from(reviews)
                .where(eq(reviews.appointmentId, appointmentId))
            dataQuery = db
                .select()
                .from(reviews)
                .where(eq(reviews.appointmentId, appointmentId))
                .orderBy(desc(reviews.createdAt))
                .limit(pageSize)
                .offset(offset)
        } else if (branchId) {
            const branchFilter = sql`${reviews.appointmentId} IN (
                SELECT id FROM appointments
                WHERE branch_id = ${branchId} OR branch_id IS NULL
            )`
            countQuery = db
                .select({ count: count() })
                .from(reviews)
                .where(branchFilter)
            dataQuery = db
                .select()
                .from(reviews)
                .where(branchFilter)
                .orderBy(desc(reviews.createdAt))
                .limit(pageSize)
                .offset(offset)
        } else {
            countQuery = db
                .select({ count: count() })
                .from(reviews)
            dataQuery = db
                .select()
                .from(reviews)
                .orderBy(desc(reviews.createdAt))
                .limit(pageSize)
                .offset(offset)
        }

        const [countResult, paginatedReviews] = await Promise.all([countQuery, dataQuery])
        const total = countResult[0]?.count || 0

        return success({
            data: paginatedReviews.map(r => ({
                id: r.id,
                appointment_id: r.appointmentId || undefined,
                author_id: r.authorId,
                type: r.type as 'ARTIST' | 'SHOP' | 'SERVICE',
                title: r.title || undefined,
                content: r.content,
                is_public: r.isPublic ?? true,
                created_at: r.createdAt.toISOString(),
            })),
            hasMore: total > offset + pageSize,
            total,
        })
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to get appointment reviews: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure('Failed to get reviews')
    }
}

// ============================================================================
// Executive Accounting Metrics
// ============================================================================

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

export async function getPLMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<PLMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        // Get all entries in date range
        const entries = await db
            .select({
                entryType: generalLedger.entryType,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))

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
                revenue += credit - debit
            } else if (entry.entryType === 'EXPENSE') {
                expenses += debit - credit
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

        // Calculate previous period for comparison
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
            if (entry.entryType === 'REVENUE') prevRevenue += credit - debit
            else if (entry.entryType === 'EXPENSE') prevExpenses += debit - credit
        })

        const previousPeriod = {
            revenue: prevRevenue,
            expenses: prevExpenses,
            netProfit: prevRevenue - prevExpenses,
        }

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
            previousPeriod,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching P&L metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch P&L metrics')
    }
}

export type ExpenseBreakdownItem = {
    category: string
    amount: number
    percentage: number
}

export async function getExpenseBreakdown(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<ExpenseBreakdownItem[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            eq(generalLedger.entryType, 'EXPENSE'),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        // Get expense entries grouped by category
        const entries = await db
            .select({
                category: generalLedger.category,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.category)

        const totalExpenses = entries.reduce((sum, entry) => {
            return sum + ((Number(entry.debit) || 0) - (Number(entry.credit) || 0))
        }, 0)

        const breakdown = entries
            .map((entry) => {
                const net = (Number(entry.debit) || 0) - (Number(entry.credit) || 0)
                return {
                    category: entry.category || 'Uncategorized',
                    amount: net,
                    percentage: totalExpenses > 0 ? (net / totalExpenses) * 100 : 0,
                }
            })
            .filter(item => item.amount !== 0)
            .sort((a, b) => b.amount - a.amount)

        return success(breakdown)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching expense breakdown: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch expense breakdown')
    }
}

export type RevenueBreakdownItem = {
    category: string
    amount: number
    percentage: number
}

export async function getRevenueBreakdown(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<RevenueBreakdownItem[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Not authenticated')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    try {
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
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.category)

        const totalRevenue = entries.reduce((sum, entry) => {
            const net = (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
            return sum + net
        }, 0)

        const breakdown: RevenueBreakdownItem[] = entries.map((entry) => {
            const net = (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
            return {
                category: entry.category || 'Uncategorized',
                amount: net,
                percentage: totalRevenue > 0 ? (net / totalRevenue) * 100 : 0,
            }
        }).filter(item => item.amount !== 0)
            .sort((a, b) => b.amount - a.amount)

        return success(breakdown)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching revenue breakdown: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch revenue breakdown')
    }
}

export type RevenueExpenseTrendItem = {
    date: string
    revenue: number
    expenses: number
    netProfit: number
}

export async function getRevenueExpenseTrend(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<RevenueExpenseTrendItem[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        // Get all entries in date range
        const entries = await db
            .select({
                entryDate: generalLedger.entryDate,
                entryType: generalLedger.entryType,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .orderBy(desc(generalLedger.entryDate))

        // Group by date
        const grouped = new Map<string, { revenue: number; expenses: number }>()

        entries.forEach((entry) => {
            const date = new Date(entry.entryDate)
            const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            if (!grouped.has(key)) {
                grouped.set(key, { revenue: 0, expenses: 0 })
            }

            const current = grouped.get(key)
            if (current) {
                const debit = Number(entry.debit) || 0
                const credit = Number(entry.credit) || 0

                if (entry.entryType === 'REVENUE') {
                    current.revenue += credit - debit
                } else if (entry.entryType === 'EXPENSE') {
                    current.expenses += debit - credit
                }
            }
        })

        const trend = Array.from(grouped.entries()).map(([date, data]) => ({
            date,
            revenue: data.revenue,
            expenses: data.expenses,
            netProfit: data.revenue - data.expenses,
        })).reverse()

        return success(trend)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching revenue/expense trend: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch revenue/expense trend')
    }
}

export type ExecutiveAccountingMetrics = {
    pl: PLMetrics
    expenseBreakdown: ExpenseBreakdownItem[]
    revenueBreakdown: RevenueBreakdownItem[]
    trend: RevenueExpenseTrendItem[]
    operating: {
        revenue: number
        expenses: number
        netOperating: number
    }
}

export async function getExecutiveAccountingMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<ExecutiveAccountingMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const baseConditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) baseConditions.push(branchCondition)
        }

        const expenseConditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            eq(generalLedger.entryType, 'EXPENSE'),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) expenseConditions.push(branchCondition)
        }

        const revenueConditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            eq(generalLedger.entryType, 'REVENUE'),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) revenueConditions.push(branchCondition)
        }

        const [plTotals, expenseRows, revenueRows, trendRows] = await Promise.all([
            db
                .select({
                    entryType: generalLedger.entryType,
                    totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                    totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                })
                .from(generalLedger)
                .where(and(...baseConditions))
                .groupBy(generalLedger.entryType),
            db
                .select({
                    category: generalLedger.category,
                    debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                    credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                })
                .from(generalLedger)
                .where(and(...expenseConditions))
                .groupBy(generalLedger.category),
            db
                .select({
                    category: generalLedger.category,
                    debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                    credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                })
                .from(generalLedger)
                .where(and(...revenueConditions))
                .groupBy(generalLedger.category),
            db
                .select({
                    dateKey: sql<string>`TO_CHAR(${generalLedger.entryDate}, 'Mon DD, YYYY')`,
                    entryType: generalLedger.entryType,
                    totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                    totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                })
                .from(generalLedger)
                .where(and(...baseConditions))
                .groupBy(sql`TO_CHAR(${generalLedger.entryDate}, 'Mon DD, YYYY')`, generalLedger.entryType)
                .orderBy(sql`MIN(${generalLedger.entryDate}) DESC`),
        ])

        let revenue = 0
        let expenses = 0

        for (const row of plTotals) {
            if (row.entryType === 'REVENUE') {
                revenue = (Number(row.totalCredit) || 0) - (Number(row.totalDebit) || 0)
            } else if (row.entryType === 'EXPENSE') {
                expenses = (Number(row.totalDebit) || 0) - (Number(row.totalCredit) || 0)
            }
        }

        const netProfit = revenue - expenses
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

        // Calculate previous period for comparison
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
            if (entry.entryType === 'REVENUE') prevRevenue += credit - debit
            else if (entry.entryType === 'EXPENSE') prevExpenses += debit - credit
        })

        const previousPeriod = {
            revenue: prevRevenue,
            expenses: prevExpenses,
            netProfit: prevRevenue - prevExpenses,
        }

        const totalDebits = plTotals
            .filter((t) => t.entryType !== 'REVENUE')
            .reduce((sum, t) => sum + Number(t.totalDebit), 0)
        const totalCredits = plTotals
            .filter((t) => t.entryType !== 'EXPENSE')
            .reduce((sum, t) => sum + Number(t.totalCredit), 0)
        const assetTotal = plTotals.find((t) => t.entryType === 'ASSET')?.totalDebit || 0
        const liabilityTotal =
            plTotals.find((t) => t.entryType === 'LIABILITY')?.totalCredit || 0
        const equityTotal = plTotals.find((t) => t.entryType === 'EQUITY')?.totalCredit || 0

        const pl: PLMetrics = {
            revenue,
            expenses,
            netProfit,
            profitMargin,
            totalDebits,
            totalCredits,
            assetTotal,
            liabilityTotal,
            equityTotal,
            previousPeriod,
        }

        const totalExpenses = expenseRows.reduce((sum, row) => {
            return sum + ((Number(row.debit) || 0) - (Number(row.credit) || 0))
        }, 0)

        const expenseBreakdown: ExpenseBreakdownItem[] = expenseRows
            .map((row) => {
                const net = (Number(row.debit) || 0) - (Number(row.credit) || 0)
                return {
                    category: row.category || 'Uncategorized',
                    amount: net,
                    percentage: totalExpenses > 0 ? (net / totalExpenses) * 100 : 0,
                }
            })
            .filter(item => item.amount !== 0)
            .sort((a, b) => b.amount - a.amount)

        const totalRevenue = revenueRows.reduce((sum, row) => {
            return sum + ((Number(row.credit) || 0) - (Number(row.debit) || 0))
        }, 0)

        const revenueBreakdown: RevenueBreakdownItem[] = revenueRows
            .map((row) => {
                const net = (Number(row.credit) || 0) - (Number(row.debit) || 0)
                return {
                    category: row.category || 'Uncategorized',
                    amount: net,
                    percentage: totalRevenue > 0 ? (net / totalRevenue) * 100 : 0,
                }
            })
            .filter(item => item.amount !== 0)
            .sort((a, b) => b.amount - a.amount)

        const trendMap = new Map<string, { revenue: number; expenses: number }>()

        for (const row of trendRows) {
            const key = row.dateKey
            if (!trendMap.has(key)) {
                trendMap.set(key, { revenue: 0, expenses: 0 })
            }
            const current = trendMap.get(key)!
            if (row.entryType === 'REVENUE') {
                current.revenue += (Number(row.totalCredit) || 0) - (Number(row.totalDebit) || 0)
            } else if (row.entryType === 'EXPENSE') {
                current.expenses += (Number(row.totalDebit) || 0) - (Number(row.totalCredit) || 0)
            }
        }

        const trend: RevenueExpenseTrendItem[] = Array.from(trendMap.entries())
            .map(([date, data]) => ({
                date,
                revenue: data.revenue,
                expenses: data.expenses,
                netProfit: data.revenue - data.expenses,
            }))
            .reverse()

        // Operating summary (accrual-based revenue and expenses)
        const operating = {
            revenue: pl.revenue,
            expenses: pl.expenses,
            netOperating: pl.netProfit,
        }

        const metrics: ExecutiveAccountingMetrics = {
            pl,
            expenseBreakdown,
            revenueBreakdown,
            trend,
            operating,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching executive accounting metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch executive accounting metrics')
    }
}

export interface MetricsExportResult {
    success: boolean
    data?: string
    filename?: string
    mimeType?: string
    error?: string
}

// ============================================================================
// Aggregated Business Insights Metrics (optimized for single call)
// ============================================================================

export type BusinessInsightsMetrics = {
    financials: FinancialMetrics
    revenueTrend: RevenueTrend
    operations: OperationalMetrics
    inventory: InventoryMetrics
    netIncome: NetIncomeMetrics
    clientTypes: ClientTypeMetrics
    staffLeaderboard: StaffLeaderboardEntry[]
}

type GLAggregates = {
    financials: FinancialMetrics
    trend: RevenueTrend
    netIncome: NetIncomeMetrics
}

async function fetchGeneralLedgerAggregates(
    start: Date,
    end: Date,
    groupBy: "day" | "month",
    branchId?: string,
    paymentMethod?: string
): Promise<GLAggregates> {
    const branchCondition = branchId
        ? or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
        : undefined

    const baseConditions: SQL<unknown>[] = [
        eq(generalLedger.isVoided, false),
        gte(generalLedger.entryDate, start),
        lte(generalLedger.entryDate, end),
    ]
    if (branchCondition) baseConditions.push(branchCondition)
    if (paymentMethod) baseConditions.push(eq(generalLedger.paymentMethod, paymentMethod))

    const [totalsResult, trendResult] = await Promise.all([
        db
            .select({
                entryType: generalLedger.entryType,
                totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                count: count(),
            })
            .from(generalLedger)
            .where(and(...baseConditions))
            .groupBy(generalLedger.entryType),
        db
            .select({
                entryDate: generalLedger.entryDate,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(
                ...baseConditions,
                eq(generalLedger.entryType, 'REVENUE')
            ))
            .orderBy(desc(generalLedger.entryDate)),
    ])

    let revenue = 0
    let expenses = 0
    let transactions = 0

    for (const row of totalsResult) {
        if (row.entryType === 'REVENUE') {
            revenue = (Number(row.totalCredit) || 0) - (Number(row.totalDebit) || 0)
            transactions = Number(row.count) || 0
        } else if (row.entryType === 'EXPENSE') {
            expenses = (Number(row.totalDebit) || 0) - (Number(row.totalCredit) || 0)
        }
    }

    const financials: FinancialMetrics = {
        revenue,
        transactions,
        averageTicket: transactions > 0 ? revenue / transactions : 0,
    }

    const netIncome: NetIncomeMetrics = {
        revenue,
        expenses,
        netIncome: revenue - expenses,
    }

    const grouped = new Map<string, number>()

    for (const entry of trendResult) {
        const date = new Date(entry.entryDate)
        const label = groupBy === 'month'
            ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const current = grouped.get(label) || 0
        grouped.set(label, current + ((Number(entry.credit) || 0) - (Number(entry.debit) || 0)))
    }

    const trend: RevenueTrend = Array.from(grouped.entries())
        .map(([date, revenue]) => ({ date, revenue }))
        .reverse()

    return { financials, trend, netIncome }
}

type AppointmentAggregates = {
    operations: OperationalMetrics
    clientTypes: ClientTypeMetrics
}

async function fetchAppointmentAggregates(
    start: Date,
    end: Date,
    branchId?: string
): Promise<AppointmentAggregates> {
    const branchCondition = branchId
        ? or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
        : undefined

    const conditions: SQL<unknown>[] = [
        eq(appointments.isActive, true),
        gte(appointments.timeStart, start),
        lte(appointments.timeStart, end),
    ]
    if (branchCondition) conditions.push(branchCondition)

    const result = await db
        .select({
            status: appointments.status,
            isWalkin: appointments.isWalkin,
            count: count(),
        })
        .from(appointments)
        .where(and(...conditions))
        .groupBy(appointments.status, appointments.isWalkin)

    let totalAppointments = 0
    let completedAppointments = 0
    let cancelledAppointments = 0
    let walkinCount = 0
    let personalCount = 0

    for (const row of result) {
        const cnt = Number(row.count) || 0
        totalAppointments += cnt
        if (row.status === 'COMPLETED') completedAppointments += cnt
        if (row.status === 'CANCELLED') cancelledAppointments += cnt
        if (row.isWalkin) walkinCount += cnt
        else personalCount += cnt
    }

    const operations: OperationalMetrics = {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        cancellationRate: totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0,
    }

    const clientTypes: ClientTypeMetrics = {
        walkinCount,
        personalCount,
    }

    return { operations, clientTypes }
}

async function fetchInventoryAggregates(branchId?: string): Promise<InventoryMetrics> {
    const branchCondition = branchId
        ? or(eq(inventory.branchId, branchId!), isNull(inventory.branchId))
        : undefined

    const conditions: SQL<unknown>[] = [eq(inventory.isActive, true)]
    if (branchCondition) conditions.push(branchCondition)

    const items = await db
        .select({
            name: inventory.name,
            currentStock: inventory.currentStock,
            unitPrice: inventory.unitPrice,
            sellingPrice: inventory.sellingPrice,
        })
        .from(inventory)
        .where(and(...conditions))

    let totalValue = 0
    let potentialRevenue = 0

    for (const item of items) {
        const quantity = Number(item.currentStock) || 0
        const cost = Number(item.unitPrice) || 0
        const price = Number(item.sellingPrice) || 0
        totalValue += cost * quantity
        potentialRevenue += price * quantity
    }

    const topSelling = items
        .map(item => ({
            name: item.name || "Unknown",
            quantity: Number(item.currentStock) || 0,
            revenue: (Number(item.sellingPrice) || 0) * (Number(item.currentStock) || 0),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

    return { totalValue, potentialRevenue, topSelling }
}

async function fetchLeaderboardData(
    start: Date,
    end: Date,
    branchId?: string
): Promise<StaffLeaderboardEntry[]> {
    const result = await getStaffLeaderboard(
        start.toISOString(),
        end.toISOString(),
        branchId
    )
    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch leaderboard data')
    }
    return result.data
}

export async function getBusinessInsightsMetrics(
    startDate: string,
    endDate: string,
    groupBy: "day" | "month" = "day",
    branchId?: string,
    paymentMethod?: string,
    _forceRefresh?: boolean
): Promise<ActionResponse<BusinessInsightsMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const [glAgg, apptAgg, invAgg, leaderboard] = await Promise.all([
            fetchGeneralLedgerAggregates(start, end, groupBy, branchId, paymentMethod),
            fetchAppointmentAggregates(start, end, branchId),
            fetchInventoryAggregates(branchId),
            fetchLeaderboardData(start, end, branchId),
        ])

        const metrics: BusinessInsightsMetrics = {
            financials: glAgg.financials,
            revenueTrend: glAgg.trend,
            operations: apptAgg.operations,
            inventory: invAgg,
            netIncome: glAgg.netIncome,
            clientTypes: apptAgg.clientTypes,
            staffLeaderboard: leaderboard,
        }

        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching business insights metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch business insights metrics')
    }
}

// ============================================================================
// Export Metrics
// ============================================================================

export async function exportMetrics(
    format: MetricsExportFormat,
    startDate: string,
    endDate: string,
    _groupBy: "day" | "month" = "day",
    branchId?: string
): Promise<ActionResponse<MetricsExportResult>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authorized')
        }

        const hasAccess = await canAccessAccounting(user)
        if (!hasAccess) {
            return failure('Not authorized')
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const entries = await db
            .select({
                entryDate: generalLedger.entryDate,
                entryType: generalLedger.entryType,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))

        let totalRevenue = 0
        let totalExpenses = 0
        let transactionCount = 0

        for (const entry of entries) {
            if (entry.entryType === 'REVENUE') {
                totalRevenue += (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
            } else if (entry.entryType === 'EXPENSE') {
                totalExpenses += (Number(entry.debit) || 0) - (Number(entry.credit) || 0)
            }
            transactionCount++
        }

        const operationalResult = await getOperationalMetrics(startDate, endDate, branchId)
        const appointments = operationalResult.success ? operationalResult.data?.totalAppointments || 0 : 0

        const dateLabel = `${startDate} to ${endDate}`

        const metricsExportRows: MetricsExportRow[] = [{
            date: dateLabel,
            revenue: totalRevenue,
            expenses: totalExpenses,
            netIncome: totalRevenue - totalExpenses,
            transactionCount,
            averageTicket: transactionCount > 0 ? totalRevenue / transactionCount : 0,
            appointments,
            clients: 0,
        }]

        const scope: GroupedExportOptions['scope'] = {
            type: 'GENERAL_LEDGER',
            startDate,
            endDate,
            branchId,
        }

        const exportOptions: GroupedExportOptions = {
            format: format === 'excel' ? 'xlsx' : format,
            grouping: {
                dimensions: [],
                includeSummary: false,
                includeCharts: false,
            },
            scope,
            title: 'Metrics Report',
            subtitle: '',
            generatedAt: new Date().toISOString(),
        }

        const result = await generateGroupedMetricsExport(metricsExportRows, exportOptions)

        return success({
            success: true,
            data: result.content,
            filename: result.filename,
            mimeType: result.mimeType,
        })
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to export metrics: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to export metrics')
    }
}

export interface ExportGroupedMetricsOptions {
    format: ExportFormat
    grouping: GroupingConfig
    startDate: string
    endDate: string
    groupBy?: 'day' | 'month'
    branchId?: string
}

export async function exportGroupedMetrics(
    options: ExportGroupedMetricsOptions
): Promise<ActionResponse<ExportResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const { format, grouping, startDate, endDate, groupBy = 'day', branchId } = options

        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const entries = await db
            .select({
                entryDate: generalLedger.entryDate,
                entryType: generalLedger.entryType,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .orderBy(asc(generalLedger.entryDate))

        const grouped = new Map<string, { revenue: number; expenses: number; transactionCount: number }>()

        for (const entry of entries) {
            const date = new Date(entry.entryDate)
            const label = groupBy === 'month'
                ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            if (!grouped.has(label)) {
                grouped.set(label, { revenue: 0, expenses: 0, transactionCount: 0 })
            }

            const current = grouped.get(label)!
            if (entry.entryType === 'REVENUE') {
                current.revenue += (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
            } else if (entry.entryType === 'EXPENSE') {
                current.expenses += (Number(entry.debit) || 0) - (Number(entry.credit) || 0)
            }
            current.transactionCount++
        }

        const metricsExportRows: MetricsExportRow[] = Array.from(grouped.entries())
            .map(([date, data]) => ({
                date,
                revenue: data.revenue,
                expenses: data.expenses,
                netIncome: data.revenue - data.expenses,
                transactionCount: data.transactionCount,
                averageTicket: data.transactionCount > 0 ? data.revenue / data.transactionCount : 0,
            }))
            .reverse()

        const scope: GroupedExportOptions['scope'] = {
            type: 'GENERAL_LEDGER',
            startDate,
            endDate,
            branchId,
        }

        const exportOptions: GroupedExportOptions = {
            format,
            grouping,
            scope,
            title: 'Grouped Metrics Report',
            subtitle: grouping.dimensions.join(', '),
            generatedAt: new Date().toISOString(),
        }

        const result = await generateGroupedMetricsExport(metricsExportRows, exportOptions)
        return success(result)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'METRICS', message: `Failed to export grouped metrics: ${error instanceof Error ? error.message : String(error)}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to export grouped metrics')
    }
}
