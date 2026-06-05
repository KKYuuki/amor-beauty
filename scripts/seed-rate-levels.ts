#!/usr/bin/env bun
console.warn('⚠️  This script is deprecated. Use `bun run db:seed` instead.')
console.warn('   Rate levels are now seeded by the unified seed script.\n')

import { seedDatabase } from './seed-database'
import { config } from 'dotenv'
config({ path: '.env.local' })

seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error)
        process.exit(1)
    })
