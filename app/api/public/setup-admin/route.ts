import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { invitations } from '@/server/db/schema/invitations';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'Please provide an email query parameter (e.g., ?email=your@email.com)' }, { status: 400 });
    }

    try {
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const [invitation] = await db.insert(invitations).values({
            email: email.toLowerCase().trim(),
            role: 'ADMIN',
            token,
            expiresAt,
        }).returning();

        return NextResponse.json({
            success: true,
            message: 'Invitation created successfully! Please use this token on the Sign Up page.',
            email: invitation.email,
            role: invitation.role,
            invitationCode: invitation.token
        });
    } catch (error: any) {
        // If it fails because of unique constraint, fetch the existing token
        if (error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
            const existing = await db.select().from(invitations).where(eq(invitations.email, email.toLowerCase().trim())).limit(1);
            if (existing.length > 0) {
                return NextResponse.json({
                    success: true,
                    message: 'An invitation already exists for this email. Here is the code:',
                    email: existing[0].email,
                    role: existing[0].role,
                    invitationCode: existing[0].token
                });
            }
        }
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
