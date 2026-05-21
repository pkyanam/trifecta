export const CLOUD_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: '$9',
    interval: 'mo',
    monthlyLaunchHours: 60,
    runningSandboxLimit: 1,
    storedSandboxLimit: 3,
    allowedSandboxTiers: ['launch'],
    gpuEnabled: false,
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    interval: 'mo',
    monthlyLaunchHours: 150,
    runningSandboxLimit: 2,
    storedSandboxLimit: 8,
    allowedSandboxTiers: ['launch', 'build'],
    gpuEnabled: true,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  team: {
    id: 'team',
    name: 'Team',
    price: '$49',
    interval: 'mo',
    monthlyLaunchHours: 400,
    runningSandboxLimit: 4,
    storedSandboxLimit: 20,
    allowedSandboxTiers: ['launch', 'build', 'max-cpu'],
    gpuEnabled: true,
    stripePriceEnv: 'STRIPE_PRICE_TEAM',
  },
} as const;

export type CloudPlanId = keyof typeof CLOUD_PLANS;

export const SANDBOX_SIZE_TIERS = {
  launch: {
    id: 'launch',
    label: 'Launch',
    cpu: 1,
    memory: 2,
    disk: 10,
    price: '$0.12/hr',
    creditMultiplier: 1,
  },
  build: {
    id: 'build',
    label: 'Build',
    cpu: 2,
    memory: 4,
    disk: 10,
    price: '$0.24/hr',
    creditMultiplier: 2,
  },
  'max-cpu': {
    id: 'max-cpu',
    label: 'Max CPU',
    cpu: 4,
    memory: 8,
    disk: 10,
    price: '$0.48/hr',
    creditMultiplier: 4,
  },
} as const;

export type SandboxSizeTier = keyof typeof SANDBOX_SIZE_TIERS;

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active']);

export function isCloudPlanId(value: string): value is CloudPlanId {
  return value in CLOUD_PLANS;
}

export function isSandboxSizeTier(value: string): value is SandboxSizeTier {
  return value in SANDBOX_SIZE_TIERS;
}

export function stripePriceIdForPlan(planId: CloudPlanId): string | null {
  const envName = CLOUD_PLANS[planId].stripePriceEnv;
  return process.env[envName] || null;
}

export function planFromStripePriceId(priceId: string | null | undefined): CloudPlanId | null {
  if (!priceId) return null;

  for (const plan of Object.values(CLOUD_PLANS)) {
    if (process.env[plan.stripePriceEnv] === priceId) {
      return plan.id;
    }
  }

  return null;
}

export function canUseSandboxTier(planId: CloudPlanId | null, sandboxTier: SandboxSizeTier): boolean {
  if (!planId) return false;
  return (CLOUD_PLANS[planId].allowedSandboxTiers as readonly SandboxSizeTier[]).includes(sandboxTier);
}
