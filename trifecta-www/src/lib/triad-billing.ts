export const TRIAD_FOUNDER_PLAN = {
  id: 'triad-founder',
  name: 'founder access',
  price: '$19.99',
  interval: 'mo',
  includedGatewayUsage: '$23.50',
  stripePriceEnv: 'STRIPE_PRICE_TRIAD_FOUNDER',
} as const;

export function triadFounderStripePriceId(): string | null {
  return process.env[TRIAD_FOUNDER_PLAN.stripePriceEnv] || null;
}
