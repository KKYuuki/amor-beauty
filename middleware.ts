import { type NextRequest, NextResponse } from 'next/server'
import { routeConfig } from '@/utils/routes-config'
import { auth } from '@/server/auth'

// Use Node.js runtime since Better-Auth requires Node.js crypto
export const runtime = 'nodejs'

export async function middleware(request: NextRequest) {
    const response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const path = request.nextUrl.pathname

    // Find matching route
    const matchingRoute = routeConfig.find(r => {
        if (r.href === '/') return path === '/'
        return path.startsWith(r.href)
    })

    // If not a known route, allow through (could be API, static, etc.)
    if (!matchingRoute) {
        return response
    }

    // Get session via Better-Auth (reads from cookies, no DB query needed)
    const session = await auth.api.getSession({
        headers: request.headers,
    })

    // All known routes require authentication
    if (!session?.user) {
        const returnTo = encodeURIComponent(path)
        return NextResponse.redirect(new URL(`/auth?returnTo=${returnTo}`, request.url))
    }

    const { user } = session

    // Routes with no permission requirement — allow through (authenticated)
    if (!matchingRoute.perms) {
        return response
    }

    // Special case: "admin" perms means admin role only
    if (matchingRoute.perms === 'admin') {
        if (user.role !== 'admin') {
            return NextResponse.redirect(new URL('/unauthorized', request.url))
        }
        return response
    }

    // Admin role bypass — admins can access everything
    if (user.role === 'admin') {
        return response
    }

    // For non-admin users, check access flags against route permission
    const { db } = await import('@/server/db')
    const { user: userTable } = await import('@/server/db/schema/auth')
    const { eq } = await import('drizzle-orm')
    const { normalizeFlag } = await import('@/utils/auth/access-flags')

    const [userProfile] = await db
        .select({
            access_flags: userTable.accessFlags,
            is_active: userTable.isActive,
        })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1)

    if (!userProfile) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    // Block deactivated accounts
    if (!userProfile.is_active) {
        const signOut = new URL('/auth', request.url)
        signOut.searchParams.set('error', 'account_disabled')
        return NextResponse.redirect(signOut)
    }

    const flags = (userProfile.access_flags ?? []) as string[]
    const requiredPerms = matchingRoute.perms

    // If route has no permission requirement, allow through
    if (!requiredPerms) {
        return response
    }

    // Check primary perm first
    const hasPrimaryFlag = flags.some(f => normalizeFlag(f) === normalizeFlag(requiredPerms))

    // Check fallback perms if primary fails
    const hasFallbackFlag = matchingRoute.fallbackPerms?.some(fp =>
        flags.some(f => normalizeFlag(f) === normalizeFlag(fp))
    ) ?? false

    const hasAccess = hasPrimaryFlag || hasFallbackFlag

    if (!hasAccess) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - auth (auth page)
         * - unauthorized (the page we redirect to)
         * - api/auth (Better-Auth API routes — CRITICAL: must be excluded!)
         * - api/* (API routes)
         * - icon.svg (public asset)
         * - public assets (images, etc)
         */
        '/((?!_next/static|_next/image|favicon.ico|auth|unauthorized|api|icon.svg|.*\\.(?:jpg|jpeg|gif|png|svg|ico)).*)',
    ],
}
