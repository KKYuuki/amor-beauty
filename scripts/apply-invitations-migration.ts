#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function applyMigration() {
    console.log('\n📦 Applying Invitations Migration\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        // Check if invitations table already exists
        const checkResult = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'invitations'
            )
        `)
        
        if (checkResult.rows[0].exists) {
            console.log('✅ Invitations table already exists')
        } else {
            console.log('Creating invitations table...')
            
            // Create invitations table
            await client.query(`
                CREATE TABLE "invitations" (
                    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    "created_at" timestamp DEFAULT now() NOT NULL,
                    "updated_at" timestamp DEFAULT now() NOT NULL,
                    "email" varchar(255) NOT NULL,
                    "role" varchar(50) DEFAULT 'STAFF' NOT NULL,
                    "token" varchar(255) NOT NULL,
                    "expires_at" timestamp NOT NULL,
                    "used_at" timestamp,
                    "created_by" uuid,
                    CONSTRAINT "invitations_email_unique" UNIQUE("email"),
                    CONSTRAINT "invitations_token_unique" UNIQUE("token")
                )
            `)
            
            // Add foreign key constraint
            await client.query(`
                ALTER TABLE "invitations" 
                ADD CONSTRAINT "invitations_created_by_user_id_fk" 
                FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") 
                ON DELETE set null ON UPDATE no action
            `)
            
            // Create indexes
            await client.query(`CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email")`)
            await client.query(`CREATE INDEX "idx_invitations_token" ON "invitations" USING btree ("token")`)
            await client.query(`CREATE INDEX "idx_invitations_expires_at" ON "invitations" USING btree ("expires_at")`)
            await client.query(`CREATE INDEX "idx_invitations_used_at" ON "invitations" USING btree ("used_at")`)
            
            console.log('✅ Invitations table created successfully')
        }
        
        // Also create other tables from migration 0001 if they don't exist
        const tables = ['appointments', 'appointment_items', 'appointment_services', 'tattoo_details', 'piercing_details', 'shoe_details']
        
        for (const table of tables) {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = '${table}'
                )
            `)
            
            if (!tableCheck.rows[0].exists) {
                console.log(`⚠️  Table '${table}' from migration 0001 does not exist`)
            } else {
                console.log(`✅ Table '${table}' exists`)
            }
        }
        
        console.log('\n✅ Migration check complete\n')
        
    } catch (error) {
        console.error('\n❌ Migration failed:\n')
        console.error(`   ${(error as Error).message}\n`)
        process.exit(1)
    } finally {
        await client.end()
    }
}

applyMigration()
