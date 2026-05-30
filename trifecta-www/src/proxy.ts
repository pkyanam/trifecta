import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

const isDashboard = createRouteMatcher(['/dashboard(.*)']);
const LEGACY_HOSTNAME = 'trifecta.belweave.ai';
const CANONICAL_HOSTNAME = 'trifecta.belweave.com';

// clerkMiddleware initialized once; only invoked when keys are present.
// Without this guard, Clerk throws MIDDLEWARE_INVOCATION_FAILED on every
// request in environments where Clerk is not configured (e.g. marketing-only
// deployments or preview environments without dashboard env vars).
const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (isDashboard(request)) {
    await auth.protect();
  }
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const requestHostname = request.headers.get('host')?.split(':', 1)[0] ?? request.nextUrl.hostname;

  if (requestHostname === LEGACY_HOSTNAME) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = CANONICAL_HOSTNAME;
    return NextResponse.redirect(canonicalUrl);
  }

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
