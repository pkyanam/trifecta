import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { gatewayFetch, clerkUserEmail } from '@/lib/triad-gateway';

export const runtime = 'nodejs';

// Generate a new API key (raw value returned exactly once).
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = await clerkUserEmail();
  if (!email) return NextResponse.json({ error: 'No email on account' }, { status: 400 });

  const res = await gatewayFetch('/manage/keys', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
