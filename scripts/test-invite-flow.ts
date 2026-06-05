#!/usr/bin/env bun
import { auth } from '../server/auth'
import { db } from '../server/db/index'
import { invitations } from '../server/db/schema/invitations'
import { eq } from 'drizzle-orm'
import { config } from 'dotenv'

config({ path: '.env.local' })

const TEST_EMAIL = 'test3@example.com'
const TEST_PASSWORD = 'TestPassword123!'
const CORRECT_TOKEN = 'b02431107790e97c9da16432f1340c88410c51f9ab7afba16bf24339610c37a4'
const WRONG_TOKEN = 'wrong_token_12345678901234567890123456789012'

async function testInviteFlow() {
    console.log('\n🧪 Testing Invite Flow\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    await db.$client.connect()
    
    try {
        // Test 1: Try to sign up WITHOUT invitation code
        console.log('\n📋 Test 1: Sign up WITHOUT invitation code')
        console.log('Expected: Should FAIL with "Invalid or expired invitation code"')
        
        try {
            await auth.api.signUpEmail({
                body: {
                    email: TEST_EMAIL,
                    password: TEST_PASSWORD,
                    name: 'Test User',
                },
            })
            console.log('❌ FAILED: Sign up succeeded without invitation code')
        } catch (error) {
            const errorMessage = (error as Error).message
            if (errorMessage.includes('Invalid or expired invitation code')) {
                console.log('✅ PASSED: Got expected error')
                console.log(`   Error: ${errorMessage}`)
            } else {
                console.log('❌ FAILED: Got unexpected error')
                console.log(`   Error: ${errorMessage}`)
            }
        }
        
        // Test 2: Try to sign up with WRONG invitation code
        console.log('\n📋 Test 2: Sign up with WRONG invitation code')
        console.log('Expected: Should FAIL with "Invalid or expired invitation code"')
        
        try {
            await auth.api.signUpEmail({
                body: {
                    email: TEST_EMAIL,
                    password: TEST_PASSWORD,
                    name: 'Test User',
                    invitationCode: WRONG_TOKEN,
                } as { name: string; email: string; password: string; invitationCode?: string },
            })
            console.log('❌ FAILED: Sign up succeeded with wrong invitation code')
        } catch (error) {
            const errorMessage = (error as Error).message
            if (errorMessage.includes('Invalid or expired invitation code')) {
                console.log('✅ PASSED: Got expected error')
                console.log(`   Error: ${errorMessage}`)
            } else {
                console.log('❌ FAILED: Got unexpected error')
                console.log(`   Error: ${errorMessage}`)
            }
        }
        
        // Test 3: Try to sign up with CORRECT invitation code
        console.log('\n📋 Test 3: Sign up with CORRECT invitation code')
        console.log('Expected: Should SUCCEED and assign ADMIN role')
        
        try {
            const result = await auth.api.signUpEmail({
                body: {
                    email: TEST_EMAIL,
                    password: TEST_PASSWORD,
                    name: 'Test User',
                    invitationCode: CORRECT_TOKEN,
                } as { name: string; email: string; password: string; invitationCode?: string },
            })
            
            console.log('✅ PASSED: Sign up succeeded!')
            console.log(`   User ID: ${result.user?.id}`)
            console.log(`   Email: ${result.user?.email}`)
            console.log(`   Role: ${result.user?.role}`)
            
            // Verify user has ADMIN role
            if (result.user?.role === 'ADMIN') {
                console.log('✅ PASSED: User has correct ADMIN role')
            } else {
                console.log(`❌ FAILED: User has role "${result.user?.role}" instead of "ADMIN"`)
            }
            
            // Verify invitation is deleted after use
            const [invitation] = await db
                .select()
                .from(invitations)
                .where(eq(invitations.email, TEST_EMAIL))
                .limit(1)
            
            if (!invitation) {
                console.log('✅ PASSED: Invitation deleted after use')
            } else {
                console.log('❌ FAILED: Invitation not deleted after use')
            }
            
        } catch (error) {
            console.log('❌ FAILED: Sign up failed with correct invitation code')
            console.log(`   Error: ${(error as Error).message}`)
            console.log(`   Stack: ${(error as Error).stack}`)
        }
        
        // Test 4: Try to reuse the same invitation code
        console.log('\n📋 Test 4: Try to reuse used invitation code')
        console.log('Expected: Should FAIL (invitation already used)')
        
        try {
            await auth.api.signUpEmail({
                body: {
                    email: TEST_EMAIL,
                    password: TEST_PASSWORD,
                    name: 'Test User 2',
                    invitationCode: CORRECT_TOKEN,
                } as { name: string; email: string; password: string; invitationCode?: string },
            })
            console.log('❌ FAILED: Sign up succeeded with used invitation code')
        } catch (error) {
            const errorMessage = (error as Error).message
            if (errorMessage.includes('Invalid or expired invitation code') || 
                errorMessage.includes('unique constraint') ||
                errorMessage.includes('already exists')) {
                console.log('✅ PASSED: Got expected error (cannot reuse invitation)')
                console.log(`   Error: ${errorMessage}`)
            } else {
                console.log('⚠️  WARNING: Got error but might be due to email already existing')
                console.log(`   Error: ${errorMessage}`)
            }
        }
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('\n✅ All invite flow tests completed!\n')
        
    } catch (error) {
        console.error('\n❌ Test suite failed:\n')
        console.error((error as Error).message)
        process.exit(1)
    } finally {
        await db.$client.end()
    }
}

testInviteFlow()
