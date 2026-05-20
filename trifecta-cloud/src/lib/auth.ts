// Auth is handled by Clerk middleware + @clerk/nextjs/server in API routes.
// This module re-exports the helpers API routes use so imports stay concise.
export { auth } from '@clerk/nextjs/server';
