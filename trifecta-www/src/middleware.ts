import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

// The dashboard, billing, and sandbox pages are now the OS apps served from
// `/`; the legacy `/dashboard*` routes just redirect into the OS. Page-level
// auth gating happens inside the OS, and every protected API route checks
// `auth()` itself, so the middleware no longer needs to force-protect routes.
// We still run clerkMiddleware so `auth()` has request context.
//
// clerkMiddleware initialized once; only invoked when keys are present.
// Without this guard, Clerk throws MIDDLEWARE_INVOCATION_FAILED on every
// request in environments where Clerk is not configured (e.g. marketing-only
// deployments or preview environments without dashboard env vars).
const clerkHandler = clerkMiddleware();

export function middleware(request: NextRequest, event: NextFetchEvent) {
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
