#!/usr/bin/env bun
import { db } from '../server/db/index'
import { eq, and } from 'drizzle-orm'
import { rateLevels } from '../server/db/schema/rate-levels'
import { branches } from '../server/db/schema/branches'
import { systemSettings } from '../server/db/schema/settings'
import { accountingCategory } from '../server/db/schema/accounting'
import { payrollStaffRate } from '../server/db/schema/payroll'
import { services } from '../server/db/schema/services'
import { DEFAULT_SETTINGS, type SettingKey, type SettingCategory } from '../utils/types/settings'
import { config } from 'dotenv'

config({ path: '.env.local' })

const RATE_LEVELS = [
    { name: 'Standard', slug: 'standard', sortOrder: 0, isActive: true },
    { name: 'Senior', slug: 'senior', sortOrder: 1, isActive: true },
    { name: 'Owner', slug: 'owner', sortOrder: 2, isActive: true },
]

const DEFAULT_BRANCHES = [
    { name: 'Main Studio', code: 'MAIN', city: 'Cebu City', address: '123 Main Street', phone: '+63 32 123 4567', isActive: true },
]

const DEFAULT_PAYROLL_RATE_TEMPLATES = [
    { rateName: 'Hair - Walk-in - Standard', serviceType: 'HAIR', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Hair - Walk-in - Senior', serviceType: 'HAIR', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Hair - Walk-in - Owner', serviceType: 'HAIR', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Hair - Personal - Standard', serviceType: 'HAIR', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Hair - Personal - Senior', serviceType: 'HAIR', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Hair - Personal - Owner', serviceType: 'HAIR', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Walk-in - Standard', serviceType: 'NAILS', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Walk-in - Senior', serviceType: 'NAILS', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Walk-in - Owner', serviceType: 'NAILS', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Personal - Standard', serviceType: 'NAILS', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Personal - Senior', serviceType: 'NAILS', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Nails - Personal - Owner', serviceType: 'NAILS', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Walk-in - Standard', serviceType: 'FACIAL', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Walk-in - Senior', serviceType: 'FACIAL', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Walk-in - Owner', serviceType: 'FACIAL', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Personal - Standard', serviceType: 'FACIAL', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Personal - Senior', serviceType: 'FACIAL', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Facial - Personal - Owner', serviceType: 'FACIAL', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Walk-in - Standard', serviceType: 'BODY_MASSAGE', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Walk-in - Senior', serviceType: 'BODY_MASSAGE', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Walk-in - Owner', serviceType: 'BODY_MASSAGE', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Personal - Standard', serviceType: 'BODY_MASSAGE', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Personal - Senior', serviceType: 'BODY_MASSAGE', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Body Massage - Personal - Owner', serviceType: 'BODY_MASSAGE', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Walk-in - Standard', serviceType: 'WAXING', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Walk-in - Senior', serviceType: 'WAXING', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Walk-in - Owner', serviceType: 'WAXING', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Personal - Standard', serviceType: 'WAXING', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Personal - Senior', serviceType: 'WAXING', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Waxing - Personal - Owner', serviceType: 'WAXING', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Walk-in - Standard', serviceType: 'LASH_BROW', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Walk-in - Senior', serviceType: 'LASH_BROW', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Walk-in - Owner', serviceType: 'LASH_BROW', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Personal - Standard', serviceType: 'LASH_BROW', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Personal - Senior', serviceType: 'LASH_BROW', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Lash & Brow - Personal - Owner', serviceType: 'LASH_BROW', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Walk-in - Standard', serviceType: 'MAKEUP', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Walk-in - Senior', serviceType: 'MAKEUP', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Walk-in - Owner', serviceType: 'MAKEUP', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Personal - Standard', serviceType: 'MAKEUP', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Personal - Senior', serviceType: 'MAKEUP', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Makeup - Personal - Owner', serviceType: 'MAKEUP', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
]

const DEFAULT_ACCOUNTING_CATEGORIES = [
    { name: 'Hair Services', type: 'REVENUE', isActive: true },
    { name: 'Nail Services', type: 'REVENUE', isActive: true },
    { name: 'Facial Services', type: 'REVENUE', isActive: true },
    { name: 'Massage Services', type: 'REVENUE', isActive: true },
    { name: 'Waxing Services', type: 'REVENUE', isActive: true },
    { name: 'Lash & Brow Services', type: 'REVENUE', isActive: true },
    { name: 'Makeup Services', type: 'REVENUE', isActive: true },
    { name: 'Product Sales', type: 'REVENUE', isActive: true },
    { name: 'Gift Cards', type: 'REVENUE', isActive: true },
    { name: 'Tips', type: 'REVENUE', isActive: true },
    { name: 'Inventory Purchase', type: 'EXPENSE', isActive: true },
    { name: 'Rent', type: 'EXPENSE', isActive: true },
    { name: 'Utilities', type: 'EXPENSE', isActive: true },
    { name: 'Marketing', type: 'EXPENSE', isActive: true },
    { name: 'Equipment', type: 'EXPENSE', isActive: true },
    { name: 'Supplies', type: 'EXPENSE', isActive: true },
    { name: 'Staff Payroll', type: 'EXPENSE', isActive: true },
    { name: 'Maintenance', type: 'EXPENSE', isActive: true },
    { name: 'Insurance', type: 'EXPENSE', isActive: true },
    { name: 'Refunds', type: 'EXPENSE', isActive: true },
    { name: 'Voided Sales', type: 'EXPENSE', isActive: true },
    { name: 'Taxes', type: 'EXPENSE', isActive: true },
    { name: 'Equipment', type: 'ASSET', isActive: true },
    { name: 'Inventory', type: 'ASSET', isActive: true },
    { name: 'Cash', type: 'ASSET', isActive: true },
    { name: 'Bank', type: 'ASSET', isActive: true },
    { name: 'Accounts Receivable', type: 'ASSET', isActive: true },
    { name: 'Accounts Payable', type: 'LIABILITY', isActive: true },
    { name: 'Gift Card Liability', type: 'LIABILITY', isActive: true },
    { name: 'Tax Payable', type: 'LIABILITY', isActive: true },
    { name: 'Loans', type: 'LIABILITY', isActive: true },
    { name: 'Owner Equity', type: 'EQUITY', isActive: true },
    { name: 'Retained Earnings', type: 'EQUITY', isActive: true },
]

const DEFAULT_SERVICES = [
    { title: 'Hair Services', price: '0', pricingType: 'HOURLY', hourlyRate: '0', serviceType: 'HAIR', isActive: true, isShared: true },
    { title: 'Nail Services', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'NAILS', isActive: true, isShared: true },
    { title: 'Facial Services', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'FACIAL', isActive: true, isShared: true },
    { title: 'Body Massage', price: '0', pricingType: 'HOURLY', hourlyRate: '0', serviceType: 'BODY_MASSAGE', isActive: true, isShared: true },
    { title: 'Waxing Services', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'WAXING', isActive: true, isShared: true },
    { title: 'Lash & Brow Services', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'LASH_BROW', isActive: true, isShared: true },
    { title: 'Makeup Services', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'MAKEUP', isActive: true, isShared: true },
    { title: 'Other', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'OTHER', isActive: true, isShared: true },
]

export interface SeedResult {
    success: boolean
    error?: string
    stats?: { seeded: number; skipped: number }
}

async function seedRateLevels() {
    let seeded = 0, skipped = 0
    for (const level of RATE_LEVELS) {
        const existing = await db.select().from(rateLevels).where(eq(rateLevels.slug, level.slug))
        if (existing.length > 0) { skipped++; continue }
        await db.insert(rateLevels).values(level).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedBranches() {
    let seeded = 0
    const skipped = 0
    const existing = await db.select().from(branches)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_BRANCHES.length }
    for (const branch of DEFAULT_BRANCHES) {
        await db.insert(branches).values(branch).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedSettings() {
    let seeded = 0, skipped = 0
    for (const [key, setting] of Object.entries(DEFAULT_SETTINGS)) {
        const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key as SettingKey))
        if (existing.length > 0) { skipped++; continue }
        await db.insert(systemSettings).values({
            key: key as SettingKey,
            value: setting.value,
            category: setting.category as SettingCategory,
            label: setting.label,
            description: setting.description,
        })
        seeded++
    }
    return { seeded, skipped }
}

async function seedAccountingCategories() {
    let seeded = 0
    const skipped = 0
    const existing = await db.select().from(accountingCategory)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_ACCOUNTING_CATEGORIES.length }
    for (const cat of DEFAULT_ACCOUNTING_CATEGORIES) {
        await db.insert(accountingCategory).values(cat).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedPayrollRates() {
    let seeded = 0, skipped = 0
    const levels = await db.select().from(rateLevels)
    const levelMap = new Map(levels.map(l => [l.slug, l.id]))

    for (const template of DEFAULT_PAYROLL_RATE_TEMPLATES) {
        const rateLevelId = levelMap.get(template.levelSlug)
        if (!rateLevelId) { skipped++; continue }

        const existing = await db.select().from(payrollStaffRate).where(
            and(
                eq(payrollStaffRate.serviceType, template.serviceType),
                eq(payrollStaffRate.clientType, template.clientType),
                eq(payrollStaffRate.rateLevelId, rateLevelId),
            )
        ).limit(1)

        if (existing.length > 0) { skipped++; continue }

        await db.insert(payrollStaffRate).values({
            rateName: template.rateName,
            serviceType: template.serviceType,
            clientType: template.clientType,
            rateLevelId,
            shopPercentage: template.shopPercentage,
            staffPercentage: template.staffPercentage,
            paymentMode: template.paymentMode,
            fixedAmount: template.fixedAmount,
            isActive: template.isActive,
        }).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedServices() {
    let seeded = 0
    const skipped = 0
    const existing = await db.select().from(services)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_SERVICES.length }
    for (const svc of DEFAULT_SERVICES) {
        await db.insert(services).values(svc).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

export async function seedDatabase(): Promise<SeedResult> {
    try {
        const results: Record<string, { seeded: number; skipped: number }> = {}

        results.rateLevels = await seedRateLevels()
        results.branches = await seedBranches()
        results.settings = await seedSettings()
        results.accountingCategories = await seedAccountingCategories()
        results.payrollRates = await seedPayrollRates()
        results.services = await seedServices()

        const totalSeeded = Object.values(results).reduce((sum, r) => sum + r.seeded, 0)
        const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0)

        return { success: true, stats: { seeded: totalSeeded, skipped: totalSkipped } }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred',
        }
    }
}

async function main() {
    console.log('\n🌱 Amor Beauty Lounge Database Seed Script\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const steps: { name: string; icon: string; fn: () => Promise<{ seeded: number; skipped: number }> }[] = [
        { name: 'Rate Levels', icon: '📊', fn: seedRateLevels },
        { name: 'Branches', icon: '🏢', fn: seedBranches },
        { name: 'Settings', icon: '⚙️', fn: seedSettings },
        { name: 'Accounting Categories', icon: '📒', fn: seedAccountingCategories },
        { name: 'Payroll Rates', icon: '💰', fn: seedPayrollRates },
        { name: 'Services', icon: '💈', fn: seedServices },
    ]

    let totalSeeded = 0, totalSkipped = 0

    for (const step of steps) {
        console.log(`${step.icon}  Seeding ${step.name}...`)
        const result = await step.fn()
        totalSeeded += result.seeded
        totalSkipped += result.skipped
        if (result.seeded > 0) {
            console.log(`   ✅ ${result.seeded} seeded`)
        }
        if (result.skipped > 0) {
            console.log(`   ⏭️  ${result.skipped} already exist, skipped`)
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✨ Seeding complete! ${totalSeeded} seeded, ${totalSkipped} skipped`)
    console.log('\nYou can now:')
    console.log('   • Access /config for system settings')
    console.log('   • View payroll rates in /payroll')
    console.log('   • Use accounting categories in /accounting')
    console.log('   • Create transactions and appointments')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

if (import.meta.main) {
    main().catch((error) => {
        console.error('\n❌ Error seeding database:\n')
        console.error(`   ${error instanceof Error ? error.message : 'An unexpected error occurred'}`)
        process.exit(1)
    }).finally(async () => {
        await db.$client.end()
    })
}
