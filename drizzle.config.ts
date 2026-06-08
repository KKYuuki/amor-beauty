import { config } from 'dotenv';
config({ path: '.env.local' })
import { defineConfig } from 'drizzle-kit';;

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required');
}

export default defineConfig({
    out: './drizzle',
    schema: './server/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: dbUrl,
    },
});
