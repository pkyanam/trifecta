const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  return key;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_TRIFECTA_WWW_URL || 'http://localhost:3000';
}

async function stripeRequest<T>(path: string, body: URLSearchParams, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const url = method === 'GET' ? `${STRIPE_API_BASE}${path}?${body.toString()}` : `${STRIPE_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? body : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message || 'Stripe request failed';
    throw new Error(message);
  }

  return json as T;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

export interface StripePortalSession {
  url: string;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
}

export async function createStripeCustomer(userId: string, email?: string | null): Promise<StripeCustomer> {
  const body = new URLSearchParams();
  body.set('metadata[user_id]', userId);
  if (email) body.set('email', email);

  return stripeRequest<StripeCustomer>('/customers', body);
}

export async function createStripeCheckoutSession(opts: {
  userId: string;
  customerId: string;
  planId: string;
  priceId: string;
}): Promise<StripeCheckoutSession> {
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('customer', opts.customerId);
  body.set('line_items[0][price]', opts.priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', `${appUrl()}/dashboard/billing?checkout=success&plan=${opts.planId}`);
  body.set('cancel_url', `${appUrl()}/pricing`);
  body.set('client_reference_id', opts.userId);
  body.set('metadata[user_id]', opts.userId);
  body.set('metadata[plan]', opts.planId);
  body.set('subscription_data[metadata][user_id]', opts.userId);
  body.set('subscription_data[metadata][plan]', opts.planId);
  body.set('allow_promotion_codes', 'true');

  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', body);
}

/**
 * Create a checkout session for a not-yet-registered customer, keyed by email
 * (Stripe `customer_email`) rather than an existing customer id. Used by the
 * Triad self-serve checkout. Requires STRIPE_SECRET_KEY and a configured price
 * id; the caller is expected to 503 when the price id is unset.
 */
export async function createStripeCheckoutSessionForEmail(opts: {
  customerEmail: string;
  priceId: string;
  successPath: string;
  cancelPath: string;
  mode?: 'subscription' | 'payment';
  metadata?: Record<string, string>;
}): Promise<StripeCheckoutSession> {
  const mode = opts.mode ?? 'subscription';
  const body = new URLSearchParams();
  body.set('mode', mode);
  body.set('customer_email', opts.customerEmail);
  body.set('line_items[0][price]', opts.priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', `${appUrl()}${opts.successPath}`);
  body.set('cancel_url', `${appUrl()}${opts.cancelPath}`);
  body.set('allow_promotion_codes', 'true');

  for (const [key, value] of Object.entries(opts.metadata ?? {})) {
    body.set(`metadata[${key}]`, value);
    if (mode === 'subscription') {
      body.set(`subscription_data[metadata][${key}]`, value);
    }
  }

  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', body);
}

export async function createStripePortalSession(customerId: string): Promise<StripePortalSession> {
  const body = new URLSearchParams();
  body.set('customer', customerId);
  body.set('return_url', `${appUrl()}/dashboard/billing`);

  return stripeRequest<StripePortalSession>('/billing_portal/sessions', body);
}

export async function retrieveStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  const body = new URLSearchParams();
  body.set('expand[]', 'items.data.price');
  return stripeRequest<StripeSubscription>(`/subscriptions/${subscriptionId}`, body, 'GET');
}

export function unixSecondsToIso(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}
