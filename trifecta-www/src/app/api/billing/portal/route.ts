import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudAccount } from '@/lib/db';
import { createStripePortalSession } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await getCloudAccount(userId);
  if (!account?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found.' }, { status: 404 });
  }

  const session = await createStripePortalSession(account.stripe_customer_id);
  return NextResponse.json({ url: session.url });
}
