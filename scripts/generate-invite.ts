#!/usr/bin/env bun
import { input, select } from '@inquirer/prompts'
import { db } from '../server/db/index'
import { invitations } from '../server/db/schema/invitations'

import { config } from 'dotenv'

config({ path: '.env.local' })

export const _VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'ARTIST'] as const
export type Role = (typeof _VALID_ROLES)[number]

export interface InvitationResult {
    email: string
    role: Role
    token: string
    expiresAt: Date
}

function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

function generateToken(): string {
    // Generate 8-digit numeric code
    return Math.floor(10000000 + Math.random() * 90000000).toString()
}

function getExpirationDate(): Date {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    return expiresAt
}

export async function createInvitation(email: string, role: Role): Promise<InvitationResult> {
    const token = generateToken()
    const expiresAt = getExpirationDate()

    const [invitation] = await db
        .insert(invitations)
        .values({
            email: email.toLowerCase().trim(),
            role,
            token,
            expiresAt,
        })
        .returning()

    return {
        email: invitation.email,
        role: role,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
    }
}

function showHelp(): void {
    console.log('\n🎫 Invitation Code Generator\n')
    console.log('Usage: bun run scripts/generate-invite.ts [options]\n')
    console.log('Options:')
    console.log('  --email <email>    Email address for the invitation')
    console.log('  --role <role>      Role for the invitation (ADMIN, MANAGER, STAFF, ARTIST)')
    console.log('  --help             Show this help message\n')
    console.log('Examples:')
    console.log('  bun run scripts/generate-invite.ts')
    console.log('  bun run scripts/generate-invite.ts --email admin@example.com --role ADMIN\n')
}

function parseArgs(): { email?: string; role?: Role; help?: boolean } | null {
    const args = process.argv.slice(2)
    const result: { email?: string; role?: Role; help?: boolean } = {}

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help' || args[i] === '-h') {
            result.help = true
        } else if (args[i] === '--email' && args[i + 1]) {
            result.email = args[i + 1]
            i++
        } else if (args[i] === '--role' && args[i + 1]) {
            const roleValue = args[i + 1].toUpperCase() as Role
            if (_VALID_ROLES.includes(roleValue)) {
                result.role = roleValue
            }
            i++
        }
    }

    return Object.keys(result).length > 0 ? result : null
}

async function main() {
    console.log('\n🎫 Invitation Code Generator\n')

    try {
        let email: string
        let role: Role

        const args = parseArgs()

        if (args?.help) {
            showHelp()
            process.exit(0)
        }

        if (args?.email && args?.role) {
            email = args.email
            role = args.role
            
            if (!validateEmail(email)) {
                console.error('\n❌ Error: Invalid email address provided\n')
                process.exit(1)
            }
            
            console.log(`Creating invitation for: ${email} (${role})`)
        } else {
            email = await input({
                message: 'Enter email address:',
                validate: (value: string) => {
                    if (!value.trim()) {
                        return 'Email is required'
                    }
                    if (!validateEmail(value)) {
                        return 'Please enter a valid email address'
                    }
                    return true
                },
            })

            role = await select<Role>({
                message: 'Select role:',
                choices: [
                    { name: 'ADMIN', value: 'ADMIN', description: 'Full system access' },
                    { name: 'MANAGER', value: 'MANAGER', description: 'Manage staff and operations' },
                    { name: 'STAFF', value: 'STAFF', description: 'General staff member' },
                    { name: 'ARTIST', value: 'ARTIST', description: 'Tattoo artist' },
                ],
            })
        }

        const invitation = await createInvitation(email, role)

        console.log('\n✅ Invitation created successfully!\n')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`📧 Email:      ${invitation.email}`)
        console.log(`🎭 Role:       ${invitation.role}`)
        console.log(`🔗 Token:      ${invitation.token}`)
        console.log(`⏰ Expires:    ${invitation.expiresAt.toLocaleString()}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        console.log('Share this invitation code with the user:')
        console.log(`\n   ${invitation.token}\n`)
    } catch (error) {
        console.error('\n❌ Error creating invitation:\n')

        if (error instanceof Error) {
            if (error.message.includes('unique constraint')) {
                if (error.message.includes('email')) {
                    console.error('   An invitation already exists for this email address.')
                } else if (error.message.includes('token')) {
                    console.error('   Token collision occurred. Please try again.')
                } else {
                    console.error(`   ${error.message}`)
                }
            } else {
                console.error(`   ${error.message}`)
            }
        } else {
            console.error('   An unexpected error occurred')
        }

        console.log()
        process.exit(1)
    } finally {
        await db.$client.end()
    }
}

if (import.meta.main) {
    main()
}
