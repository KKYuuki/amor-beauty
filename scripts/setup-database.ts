#!/usr/bin/env bun
import { execSync } from 'child_process'
import { createInvitation, Role } from './generate-invite'
import { seedDatabase } from './seed-database'
import { config } from 'dotenv'
import { input, select } from '@inquirer/prompts'

config({ path: '.env.local' })

const _VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'ARTIST'] as const

async function pushSchema(dbUrl?: string): Promise<boolean> {
    console.log('\n📤 Pushing schema to database...\n')
    
    try {
        const env = dbUrl ? { ...process.env, DATABASE_URL: dbUrl } : process.env
        execSync('bun run db:push', {
            stdio: 'inherit',
            env,
        })
        console.log('\n✅ Schema pushed successfully')
        return true
    } catch (error) {
        console.error('\n❌ Failed to push schema:', error instanceof Error ? error.message : 'Unknown error')
        return false
    }
}

async function seedData(): Promise<boolean> {
    console.log('\n🌱 Seeding database...\n')

    const result = await seedDatabase()

    if (result.success) {
        const stats = result.stats
        if (stats) {
            console.log(`\n✅ Database seeded: ${stats.seeded} new, ${stats.skipped} existing`)
        } else {
            console.log('\n✅ Database seeded successfully')
        }
        return true
    } else {
        console.error('\n❌ Failed to seed database:', result.error)
        return false
    }
}

async function createAdmin(): Promise<boolean> {
    console.log('\n👤 Creating initial admin user...\n')
    
    try {
        const email = await input({
            message: 'Enter admin email address:',
            validate: (value: string) => {
                if (!value.trim()) {
                    return 'Email is required'
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                if (!emailRegex.test(value)) {
                    return 'Please enter a valid email address'
                }
                return true
            },
        })

        const role = await select<Role>({
            message: 'Select admin role:',
            choices: [
                { name: 'ADMIN', value: 'ADMIN', description: 'Full system access' },
                { name: 'MANAGER', value: 'MANAGER', description: 'Manage staff and operations' },
            ],
        })

        const invitation = await createInvitation(email, role)

        console.log('\n✅ Admin invitation created successfully!\n')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`📧 Email:      ${invitation.email}`)
        console.log(`🎭 Role:       ${invitation.role}`)
        console.log(`🔗 Token:      ${invitation.token}`)
        console.log(`⏰ Expires:    ${invitation.expiresAt.toLocaleString()}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        console.log('Share this invitation code with the admin:')
        console.log(`\n   ${invitation.token}\n`)

        return true
    } catch (error) {
        console.error('\n❌ Failed to create admin invitation:', error instanceof Error ? error.message : 'Unknown error')
        return false
    }
}

function showHelp(): void {
    console.log('\n🚀 Database Setup Script\n')
    console.log('Usage: bun run scripts/setup-database.ts [options]\n')
    console.log('Options:')
    console.log('  --url <url>              Custom database URL (defaults to DATABASE_URL env var)')
    console.log('  --admin-email <email>    Create admin invitation for this email')
    console.log('  --admin-role <role>      Admin role (ADMIN or MANAGER)')
    console.log('  --skip-admin             Skip admin invitation creation')
    console.log('  --help, -h               Show this help message\n')
    console.log('Examples:')
    console.log('  bun run scripts/setup-database.ts')
    console.log('  bun run scripts/setup-database.ts --skip-admin')
    console.log('  bun run scripts/setup-database.ts --admin-email admin@example.com --admin-role ADMIN\n')
}

function parseArgs(): { dbUrl?: string; adminEmail?: string; adminRole?: Role; skipAdmin?: boolean; help?: boolean } {
    const args = process.argv.slice(2)
    const result: { dbUrl?: string; adminEmail?: string; adminRole?: Role; skipAdmin?: boolean; help?: boolean } = {}

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help' || args[i] === '-h') {
            result.help = true
        } else if (args[i] === '--url' && args[i + 1]) {
            result.dbUrl = args[i + 1]
            i++
        } else if (args[i] === '--admin-email' && args[i + 1]) {
            result.adminEmail = args[i + 1]
            i++
        } else if (args[i] === '--admin-role' && args[i + 1]) {
            const roleValue = args[i + 1].toUpperCase() as Role
            if (_VALID_ROLES.includes(roleValue)) {
                result.adminRole = roleValue
            } else {
                console.error(`\n❌ Invalid role: ${args[i + 1]}`)
                console.error(`   Valid roles are: ${_VALID_ROLES.join(', ')}\n`)
                process.exit(1)
            }
            i++
        } else if (args[i] === '--skip-admin') {
            result.skipAdmin = true
        }
    }

    return result
}

async function main() {
    console.log('\n🚀 Database Setup Script\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const args = parseArgs()

    if (args.help) {
        showHelp()
        process.exit(0)
    }

    if (args.adminRole && !args.adminEmail) {
        console.error('\n❌ Error: --admin-role requires --admin-email\n')
        process.exit(1)
    }

    if (args.adminEmail && !args.adminRole) {
        console.error('\n❌ Error: --admin-email requires --admin-role\n')
        console.error(`   Usage: --admin-email <email> --admin-role <role>\n`)
        process.exit(1)
    }

    if (args.dbUrl) {
        console.log(`🔌 Using custom database URL: ${args.dbUrl}\n`)
    }

    const steps = [
        { name: 'Push Schema', fn: () => pushSchema(args.dbUrl) },
        { name: 'Seed Data', fn: seedData },
        { name: 'Create Admin', fn: () => {
            if (args.skipAdmin) {
                console.log('\n⏭️  Skipping admin creation (--skip-admin flag provided)\n')
                return Promise.resolve(true)
            }
            if (args.adminEmail && args.adminRole) {
                console.log(`\n👤 Creating admin for: ${args.adminEmail} (${args.adminRole})\n`)
                return createInvitation(args.adminEmail, args.adminRole).then(() => true)
            }
            return createAdmin()
        }},
    ]

    for (const step of steps) {
        const success = await step.fn()
        if (!success) {
            console.error(`\n❌ Setup failed at step: ${step.name}`)
            console.error('Please fix the issue and try again.\n')
            process.exit(1)
        }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✨ Database setup complete!')
    console.log('\nYour database is now ready for use.\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch((error) => {
    console.error('\n❌ Setup failed:\n')
    console.error(`   ${error instanceof Error ? error.message : 'An unexpected error occurred'}`)
    process.exit(1)
})
