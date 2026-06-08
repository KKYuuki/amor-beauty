import { config } from 'dotenv';
config({ path: '.env.local' })
import { defineConfig } from 'drizzle-kit';;

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required');
}

if (!dbUrl.includes('sslmode=disable')) {
    dbUrl += '?sslmode=disable';
}

export default defineConfig({
    out: './drizzle',
    schema: './server/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: dbUrl,
    },
});
