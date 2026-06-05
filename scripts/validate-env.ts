#!/usr/bin/env bun
import { validateEnv } from '../utils/env'
import 'dotenv/config'

console.log('🔍 Validating environment variables...\n')

try {
    const env = validateEnv()
    console.log('✅ All environment variables are valid!\n')
    console.log('Environment:', env.NODE_ENV)
    console.log('Database:', env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'))
    console.log('App URL:', env.NEXT_PUBLIC_APP_URL)
    console.log('Auth URL:', env.BETTER_AUTH_URL)
    console.log('S3 Endpoint:', env.S3_ENDPOINT)
    console.log('S3 Bucket:', env.S3_BUCKET)
    console.log('Resend API Key:', env.RESEND_API_KEY.substring(0, 10) + '...')
} catch {
    console.error('❌ Environment validation failed')
    process.exit(1)
}
