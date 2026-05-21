import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { CLOUD_PLANS, stripePriceIdForPlan } from '@/lib/billing';
import { getCloudAccount, saveCheckoutSession, upsertCloudAccount } from '@/lib/db';
import { createStripeCheckoutSession, createStripeCustomer } from '@/lib/stripe';

export const runtime = 'nodejs';

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'team'] as const),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan } = checkoutSchema.parse(await request.json());
  const priceId = stripePriceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `${CLOUD_PLANS[plan].name} checkout is not configured yet.` },
      { status: 503 },
    );
  }

  const account = await getCloudAccount(userId);
  let customerId = account?.stripe_customer_id ?? null;

  if (!customerId) {
    const user = await currentUser();
    const customer = await createStripeCustomer(userId, user?.primaryEmailAddress?.emailAddress);
    customerId = customer.id;
    await upsertCloudAccount({
      user_id: userId,
      stripe_customer_id: customerId,
      subscription_status: account?.subscription_status ?? 'none',
      plan: account?.plan,
    });
  }

  const session = await createStripeCheckoutSession({
    userId,
    customerId,
    planId: plan,
    priceId,
  });

  await saveCheckoutSession({
    stripe_checkout_session_id: session.id,
    user_id: userId,
    plan,
    stripe_customer_id: customerId,
  });

  return NextResponse.json({ url: session.url });
}
