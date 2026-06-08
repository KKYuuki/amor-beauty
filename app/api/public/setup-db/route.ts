import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
    const results: string[] = [];

    try {
        // Create ticket_status enum if it doesn't exist
        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE ticket_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        results.push('✅ ticket_status enum ready');

        // Create tickets table if it doesn't exist
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS tickets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
                queue_number SERIAL NOT NULL,
                status ticket_status DEFAULT 'PENDING' NOT NULL,
                customer_name VARCHAR(255),
                total_amount DECIMAL(12, 2) NOT NULL DEFAULT '0'
            );
        `);
        results.push('✅ tickets table ready');

        // Create indexes on tickets
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at);`);
        results.push('✅ tickets indexes ready');

        // Create ticket_services table if it doesn't exist
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ticket_services (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
                price DECIMAL(12, 2) NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1
            );
        `);
        results.push('✅ ticket_services table ready');

        // Create indexes on ticket_services
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ticket_services_ticket_id ON ticket_services (ticket_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ticket_services_service_id ON ticket_services (service_id);`);
        results.push('✅ ticket_services indexes ready');

        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        return NextResponse.json({ 
            success: false, 
            results,
            error: error.message 
        }, { status: 500 });
    }
}
