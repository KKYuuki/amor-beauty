#!/usr/bin/env bun
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../server/db/index'
import { eq, sql } from 'drizzle-orm'
import { user } from '../server/db/schema/auth'
import { services } from '../server/db/schema/services'
import { inventory } from '../server/db/schema/inventory'
import { payrollStaffRate } from '../server/db/schema/payroll'
import { branches } from '../server/db/schema/branches'

// ============================================================================
// E2E Test Account Definitions
// ============================================================================
const TEST_ACCOUNTS = [
    {
        email: 'e2e-admin@rdmdstudio.com',
        fullName: 'E2E Admin',
        role: 'admin' as const,
        accessFlags: [] as string[], // admin gets all by default
        rateLevelSlug: 'owner',
        branchIds: [] as string[], // will be filled
    },
    {
        email: 'e2e-manager@rdmdstudio.com',
        fullName: 'E2E Manager',
        role: 'manager' as const,
        accessFlags: [
            'appointments_manage',
            'sales_access',
            'payroll_manage',
            'accounting_access',
            'transactions_manage',
        ],
        rateLevelSlug: 'senior',
        branchIds: [] as string[],
    },
    {
        email: 'e2e-artist@rdmdstudio.com',
        fullName: 'E2E Artist',
        role: 'artist' as const,
        accessFlags: [
            'appointments_view',
            'appointments_manage',
            'time_clock_manage',
            'artist',
        ],
        rateLevelSlug: 'standard',
        branchIds: [] as string[],
    },
    {
        email: 'e2e-staff@rdmdstudio.com',
        fullName: 'E2E Staff',
        role: 'staff' as const,
        accessFlags: [
            'appointments_view',
            'time_clock_manage',
        ],
        rateLevelSlug: 'standard',
        branchIds: [] as string[],
    },
]

// ============================================================================
// Test-Specific Seed Data
// ============================================================================
const TEST_SERVICES = [
    { title: '[E2E] Small Tattoo', price: '1500.00', pricingType: 'FIXED', serviceType: 'TATTOO', isActive: true },
    { title: '[E2E] Standard Piercing', price: '500.00', pricingType: 'FIXED', serviceType: 'PIERCING', isActive: true },
    { title: '[E2E] Shoe Cleaning Basic', price: '800.00', pricingType: 'FIXED', serviceType: 'SHOE', isActive: true },
    { title: '[E2E] Consultation', price: '300.00', pricingType: 'FIXED', serviceType: 'OTHER', isActive: true },
]

const TEST_INVENTORY = [
    { name: '[E2E] Nitrile Gloves', itemType: 'ITEM', itemCategory: 'TATTOO', currentStock: '100', sellingPrice: '50.00', unitPrice: '25.00', isActive: true, showInSales: true },
    { name: '[E2E] Black Ink 30ml', itemType: 'FLUID', itemCategory: 'TATTOO', currentStock: '50', sellingPrice: '300.00', unitPrice: '150.00', fluidUnitSize: '30', fluidRemaining: '30', fluidUnitOfMeasure: 'ml', isActive: true, showInSales: true },
    { name: '[E2E] Titanium Stud', itemType: 'ITEM', itemCategory: 'PIERCING', currentStock: '200', sellingPrice: '150.00', unitPrice: '75.00', isActive: true, showInSales: true },
]

// ============================================================================
// Main Function
// ============================================================================
async function main() {
    console.log('🔧 E2E Test Setup Script\n')

    // Step 1: Get or create branch
    const existingBranches = await db.select().from(branches).where(eq(branches.code, 'MAIN'))
    let branchId: string
    if (existingBranches.length > 0) {
        branchId = existingBranches[0].id
        console.log(`✅ Using existing branch: ${existingBranches[0].name} (${branchId})`)
    } else {
        const [newBranch] = await db.insert(branches).values({
            name: 'E2E Main Studio',
            code: 'MAIN',
            city: 'Cebu City',
            address: '123 Test Street',
            phone: '+63 32 000 0000',
            isActive: true,
        }).returning()
        branchId = newBranch.id
        console.log(`✅ Created branch: ${newBranch.name} (${branchId})`)
    }

    // Update branch IDs for all test accounts
    for (const acc of TEST_ACCOUNTS) {
        acc.branchIds = [branchId]
    }

    // Step 2: Check for existing test accounts (skip if already registered)
    console.log('\n📧 Checking test accounts...')
    for (const acc of TEST_ACCOUNTS) {
        const existingUsers = await db.select({ id: user.id, email: user.email })
            .from(user)
            .where(eq(user.email, acc.email))

        if (existingUsers.length > 0) {
            console.log(`   ⚠️  ${acc.email} — already exists (${existingUsers[0].id})`)
            // Re-activate if needed
            await db.update(user).set({ isActive: true }).where(eq(user.email, acc.email))
            console.log(`   ✅ ${acc.email} — set isActive = true`)
        } else {
            console.log(`   📝 ${acc.email} — needs invitation (run generate-invite.ts)`)
        }
    }

    // Step 3: Seed test services (skip if already exist)
    console.log('\n🛠️  Seeding test services...')
    for (const svc of TEST_SERVICES) {
        const existing = await db.select({ id: services.id })
            .from(services)
            .where(eq(services.title, svc.title))
        if (existing.length === 0) {
            await db.insert(services).values({
                title: svc.title,
                price: svc.price,
                pricingType: svc.pricingType,
                serviceType: svc.serviceType,
                isActive: svc.isActive,
                branchId: branchId,
                isShared: true,
            })
            console.log(`   ✅ Created service: ${svc.title}`)
        } else {
            console.log(`   ⚠️  Service already exists: ${svc.title}`)
        }
    }

    // Step 4: Seed test inventory
    console.log('\n📦 Seeding test inventory...')
    for (const item of TEST_INVENTORY) {
        const existing = await db.select({ id: inventory.id })
            .from(inventory)
            .where(eq(inventory.name, item.name))
        if (existing.length === 0) {
            await db.insert(inventory).values({
                name: item.name,
                itemType: item.itemType,
                itemCategory: item.itemCategory,
                currentStock: item.currentStock,
                sellingPrice: item.sellingPrice,
                unitPrice: item.unitPrice,
                isActive: item.isActive,
                showInSales: item.showInSales,
                ...(item.fluidUnitSize ? { fluidUnitSize: item.fluidUnitSize } : {}),
                ...(item.fluidRemaining ? { fluidRemaining: item.fluidRemaining } : {}),
                ...(item.fluidUnitOfMeasure ? { fluidUnitOfMeasure: item.fluidUnitOfMeasure } : {}),
                branchId: branchId,
                isShared: true,
            })
            console.log(`   ✅ Created inventory: ${item.name}`)
        } else {
            console.log(`   ⚠️  Inventory already exists: ${item.name}`)
        }
    }

    // Step 5: Verify default payroll rates exist
    console.log('\n💰 Checking payroll rates...')
    const rateCountResult = await db.select({ count: sql<number>`count(*)::int` })
        .from(payrollStaffRate)
        .where(eq(payrollStaffRate.isActive, true))
    const rateCount = rateCountResult[0]?.count ?? 0
    console.log(`   Active payroll rates: ${rateCount}`)
    if (rateCount < 18) {
        console.log('   ⚠️  Insufficient payroll rates — re-run bun run db:seed')
    } else {
        console.log('   ✅ Payroll rates OK')
    }

    // Step 6: Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ E2E Setup Complete')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Next steps:')
    console.log('1. Generate invitations for accounts marked 📝')
    console.log('2. Register accounts via browser')
    console.log('3. Start test sessions')

    await db.$client.end()
}

main().catch((err) => {
    console.error('❌ Setup failed:', err)
    process.exit(1)
})
