import { currentUser } from '@clerk/nextjs/server';

// Server-only client for the Triad gateway's Management API. The shared secret
// is never sent to the browser — these helpers run in route handlers only.
const BASE = process.env.TRIAD_GATEWAY_URL ?? 'http://localhost:8080';
const TOKEN = process.env.INTERNAL_API_TOKEN ?? '';

export async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-internal-token': TOKEN,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

// The Clerk user's primary email — the identity bridge to the gateway account.
export async function clerkUserEmail(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}
