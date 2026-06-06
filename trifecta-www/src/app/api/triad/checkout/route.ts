import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TRIAD_FOUNDER_PLAN, triadFounderStripePriceId } from '@/lib/triad-billing';
import { createStripeCheckoutSessionForEmail } from '@/lib/stripe';

export const runtime = 'nodejs';

const checkoutSchema = z.object({
  email: z.string().email(),
  plan: z.literal(TRIAD_FOUNDER_PLAN.id),
});

export async function POST(request: Request) {
  const { email, plan } = checkoutSchema.parse(await request.json());
  const priceId = triadFounderStripePriceId();

  if (!priceId) {
    return NextResponse.json(
      { error: `${TRIAD_FOUNDER_PLAN.name} checkout is not configured yet.` },
      { status: 503 },
    );
  }

  const session = await createStripeCheckoutSessionForEmail({
    customerEmail: email,
    priceId,
    mode: 'subscription',
    successPath: `/triad/signup?checkout=success&plan=${plan}`,
    cancelPath: '/triad/signup?checkout=cancelled',
    metadata: {
      service: 'triad',
      plan,
    },
  });

  return NextResponse.json({ url: session.url });
}
