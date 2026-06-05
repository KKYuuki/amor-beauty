import { z } from 'zod'

const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

    // Authentication
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url('NEXT_PUBLIC_BETTER_AUTH_URL must be a valid URL'),

    // Application URLs
    NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
    NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be a valid URL'),

    // Storage (S3)
    S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
    S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
    S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
    S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL'),
    S3_PUBLIC_URL: z.string().url('S3_PUBLIC_URL must be a valid URL'),

    // Email
    RESEND_API_KEY: z.string().startsWith('re_', 'RESEND_API_KEY must start with "re_"'),

    // Security
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY is required'),

    // Cron / Scheduled Tasks
    CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),

    // Environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Database SSL (optional, defaults to false for Docker compatibility)
    DATABASE_SSL: z.coerce.boolean().optional().default(false),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
    const parsed = envSchema.safeParse(process.env)

    if (!parsed.success) {
        console.error('❌ Invalid environment variables:')
        parsed.error.issues.forEach((issue) => {
            console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
        })
        process.exit(1)
    }

    return parsed.data
}

// Lazy-loaded validated env
let _env: Env | null = null

export function getEnv(): Env {
    if (!_env) {
        _env = validateEnv()
    }
    return _env
}

// Legacy exports for backward compatibility
export const env = {
    get siteUrl() {
        return getEnv().NEXT_PUBLIC_SITE_URL
    },
    get appUrl() {
        return getEnv().NEXT_PUBLIC_APP_URL
    },
    get betterAuthUrl() {
        return getEnv().BETTER_AUTH_URL
    },
    get publicBetterAuthUrl() {
        return getEnv().NEXT_PUBLIC_BETTER_AUTH_URL
    },
} as const
