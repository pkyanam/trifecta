import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { planFromStripePriceId, type CloudPlanId } from '@/lib/billing';
import {
  getCheckoutSession,
  getCloudAccountByStripeCustomer,
  upsertCloudAccountForPlan,
} from '@/lib/db';
import { retrieveStripeSubscription, unixSecondsToIso, type StripeSubscription } from '@/lib/stripe';

export const runtime = 'nodejs';

interface StripeEvent<T = unknown> {
  type: string;
  data: {
    object: T;
  };
}

interface CheckoutSessionObject {
  id: string;
  customer?: string;
  subscription?: string;
  client_reference_id?: string;
  metadata?: {
    user_id?: string;
    plan?: string;
  };
}

function verifyStripeSignature(payload: string, signature: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const parts = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );

  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;

  // Reject replayed webhooks: Stripe signs the timestamp into the HMAC, so
  // a valid signature with a stale timestamp means the webhook is being
  // replayed. Stripe recommends a 5-minute tolerance.
  const timestampNum = Number.parseInt(timestamp, 10);
  if (!Number.isInteger(timestampNum)) return false;
  const now = Math.floor(Date.now() / 1000);
  const TOLERANCE_SECONDS = 300;
  if (Math.abs(now - timestampNum) > TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const digest = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function updateFromSubscription(subscription: StripeSubscription, fallback?: {
  userId?: string | null;
  plan?: CloudPlanId | null;
}) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
  if (!customerId) return;

  const account = await getCloudAccountByStripeCustomer(customerId);
  const userId = fallback?.userId ?? subscriptionMetadataUserId(subscription) ?? account?.user_id;
  if (!userId) return;

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const plan = planFromStripePriceId(priceId) ?? fallback?.plan ?? (account?.plan as CloudPlanId | null) ?? null;

  await upsertCloudAccountForPlan({
    user_id: userId,
    plan,
    subscription_status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_end: unixSecondsToIso(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
  });
}

function subscriptionMetadataUserId(subscription: StripeSubscription): string | null {
  const withMetadata = subscription as StripeSubscription & { metadata?: { user_id?: string } };
  return withMetadata.metadata?.user_id ?? null;
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as CheckoutSessionObject;
    if (typeof session.subscription === 'string') {
      const savedSession = await getCheckoutSession(session.id);
      const subscription = await retrieveStripeSubscription(session.subscription);
      await updateFromSubscription(subscription, {
        userId: session.metadata?.user_id ?? session.client_reference_id ?? savedSession?.user_id,
        plan: (session.metadata?.plan as CloudPlanId | undefined) ?? savedSession?.plan ?? null,
      });
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    await updateFromSubscription(event.data.object as StripeSubscription);
  }

  return NextResponse.json({ received: true });
}
