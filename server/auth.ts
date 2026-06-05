import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { passkey } from '@better-auth/passkey';
import { eq, and, gt } from 'drizzle-orm';
import { db } from './db';
import * as schema from './db/schema';
import { invitations } from './db/schema';
import { rateLevels } from './db/schema/rate-levels';
import { recordSuccessfulLogin, updateLastLoginMethod } from './actions/audit';

if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET environment variable is required');
}

if (!process.env.BETTER_AUTH_URL) {
    throw new Error('BETTER_AUTH_URL environment variable is required');
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: schema,
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    user: {
        additionalFields: {
            fullName: { type: "string", required: false },
            phoneNumber: { type: "string", required: false },
            instagramHandle: { type: "string", required: false },
            avatarUrl: { type: "string", required: false },
            accessFlags: { type: "string[]", required: false },
            isActive: { type: "boolean", required: false, defaultValue: true },
            lastLoginAt: { type: "date", required: false },
            lastLoginMethod: { type: "string", required: false },
            loginCount: { type: "number", required: false, defaultValue: 0 },
            failedLoginAttempts: { type: "number", required: false, defaultValue: 0 },
            lastFailedLoginAt: { type: "date", required: false },
            rateLevelId: { type: "string", required: false },
            payoutPeriod: { type: "string", required: false, defaultValue: "WEEKLY" },
            branchIds: { type: "string[]", required: false, defaultValue: [] },
        },
    },
    plugins: [
        twoFactor({
            issuer: 'Inksight',
        }),
        admin(),
        passkey(),
        nextCookies(),
    ],
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
    },
    socialProviders: {},
    session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
        session: {
            create: {
                after: async (session, context) => {
                    // Track successful login when session is created
                    if (session.userId) {
                        await recordSuccessfulLogin(session.userId);
                        // Track login method from context
                        const loginMethod = context?.request?.headers?.get('x-login-method') || 'password';
                        await updateLastLoginMethod(session.userId, loginMethod);
                    }
                },
            },
        },
        user: {
            create: {
                before: async (user, context) => {
                    // Get the request body from context
                    const body = context?.body as { email?: string; invitationCode?: string } | undefined;
                    const email = user.email ?? body?.email;
                    const invitationCode = body?.invitationCode;

                    if (!invitationCode) {
                        throw new Error('Invalid or expired invitation code');
                    }

                    if (!email) {
                        throw new Error('Email is required');
                    }

                    // Find valid invitation
                    const [invitation] = await db
                        .select()
                        .from(invitations)
                        .where(
                            and(
                                eq(invitations.email, email.toLowerCase()),
                                eq(invitations.token, invitationCode),
                                gt(invitations.expiresAt, new Date())
                            )
                        )
                        .limit(1);

                    if (!invitation) {
                        throw new Error('Invalid or expired invitation code');
                    }

                    // Delete the used invitation
                    await db
                        .delete(invitations)
                        .where(eq(invitations.id, invitation.id));

                    const userUpdate: Record<string, unknown> = {
                        ...user,
                        role: invitation.role.toLowerCase(),
                    };
                    if (invitation.role.toLowerCase() === 'artist') {
                        const [standardLevel] = await db
                            .select()
                            .from(rateLevels)
                            .where(eq(rateLevels.slug, 'standard'))
                            .limit(1);
                        if (standardLevel) {
                            userUpdate.rateLevelId = standardLevel.id;
                        }
                    }

                    return {
                        data: userUpdate,
                    };
                },
            },
        },
    },
});

export type Auth = typeof auth;
