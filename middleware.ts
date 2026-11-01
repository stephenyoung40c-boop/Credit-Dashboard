import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'

export const runtime = 'nodejs'

// Exact-match public paths only.
// /api/credits uses x-api-key auth (fail-closed) — do NOT prefix-match it here
// or sub-routes like /api/credits/[id]/log would be silently exempted.
const PUBLIC_EXACT: Set<string> = new Set(['/login', '/api/auth/login', '/api/auth/check', '/api/health'])
const PUBLIC_PREFIX: string[] = []  // intentionally empty — add only with care

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next()
  if (PUBLIC_PREFIX.some(p => pathname.startsWith(p))) return NextResponse.next()

  const auth = await isAuthenticated(req)
  if (!auth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
