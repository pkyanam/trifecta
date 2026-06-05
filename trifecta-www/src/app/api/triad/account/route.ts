import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { gatewayFetch, clerkUserEmail } from '@/lib/triad-gateway';

export const runtime = 'nodejs';

// Returns the signed-in user's Triad plan, usage, and key metadata.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = await clerkUserEmail();
  if (!email) return NextResponse.json({ error: 'No email on account' }, { status: 400 });

  const res = await gatewayFetch(`/manage/account?email=${encodeURIComponent(email)}`);
  if (!res.ok) return NextResponse.json({ error: 'gateway unavailable' }, { status: 502 });
  return NextResponse.json(await res.json());
}
