/**
 * Middleware — Edge Runtime compatible.
 * Validates session cookie structure for routing.
 * Actual cryptographic verification happens server-side in auth.ts.
 */
import { NextRequest, NextResponse } from 'next/server'

/**
 * Parses a session cookie value of the form "userId:role.hmacSig"
 * without doing full HMAC verification (Edge Runtime doesn't have Node crypto).
 * HMAC is verified in getCurrentUser() on every server component/action.
 */
function parseSessionShape(
  value: string
): { userId: string; role: string } | null {
  // Format: "1:HQ.aBcDeF..." or "2:TEAM_LEAD.aBcDeF..."
  const match = value.match(/^(\d+):(HQ|TEAM_LEAD)\.[A-Za-z0-9_\-]+$/)
  if (!match) return null
  return { userId: match[1], role: match[2] }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public and internal routes
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Email/scheduler webhooks — intentionally unauthenticated (would use API key in prod)
  if (
    pathname === '/api/inbound-email' ||
    pathname === '/api/outbound-email' ||
    pathname === '/api/scheduler' ||
    pathname === '/api/demo'
  ) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get('session')
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const session = parseSessionShape(sessionCookie.value)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('session')
    return res
  }

  const { role } = session

  // Route-level authorization
  if (
    (pathname.startsWith('/hq') || pathname.startsWith('/admin')) &&
    role !== 'HQ'
  ) {
    return NextResponse.redirect(new URL('/team-lead', request.url))
  }

  if (pathname === '/cases' && role !== 'HQ') {
    return NextResponse.redirect(new URL('/team-lead', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
