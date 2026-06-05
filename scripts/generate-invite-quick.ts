#!/usr/bin/env bun
import { db } from '../server/db/index'
import { invitations } from '../server/db/schema/invitations'
import { randomBytes } from 'crypto'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

const VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'ARTIST'] as const
type Role = (typeof VALID_ROLES)[number]

function generateToken(): string {
    return randomBytes(32).toString('hex')
}

function getExpirationDate(): Date {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    return expiresAt
}

async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2)
    
    if (args.length < 2) {
        console.log('\n🎫 Invitation Code Generator (Non-Interactive)\n')
        console.log('Usage: bun run scripts/generate-invite-quick.ts <email> <role>')
        console.log('')
        console.log('Valid roles: ADMIN, MANAGER, STAFF, ARTIST')
        console.log('')
        console.log('Example: bun run scripts/generate-invite-quick.ts test@example.com ADMIN\n')
        process.exit(1)
    }
    
    const email = args[0]
    const role = args[1].toUpperCase() as Role
    
    // Validate role
    if (!VALID_ROLES.includes(role)) {
        console.error(`\n❌ Invalid role: ${role}`)
        console.error(`Valid roles: ${VALID_ROLES.join(', ')}\n`)
        process.exit(1)
    }
    
    console.log('\n🎫 Creating Invitation...\n')
    
    try {
        // Generate token
        const token = generateToken()
        const expiresAt = getExpirationDate()
        
        // Connect to database
        await db.$client.connect()
        
        // Insert invitation
        const [invitation] = await db
            .insert(invitations)
            .values({
                email: email.toLowerCase().trim(),
                role,
                token,
                expiresAt,
            })
            .returning()
        
        console.log('✅ Invitation created successfully!\n')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`📧 Email:      ${invitation.email}`)
        console.log(`🎭 Role:       ${invitation.role}`)
        console.log(`🔗 Token:      ${invitation.token}`)
        console.log(`⏰ Expires:    ${invitation.expiresAt.toLocaleString()}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        
        console.log('Share this invitation code with the user:')
        console.log(`\n   ${invitation.token}\n`)
        
        // Output just the token for easy parsing
        console.log(`INVITE_TOKEN=${invitation.token}`)
        
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
        // Close database connection
        await db.$client.end()
    }
}

main()
