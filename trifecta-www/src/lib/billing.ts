export const CLOUD_PLANS = {
  free: {
    id: 'free',
    name: 'Free Trial',
    price: '$0',
    interval: 'once',
    monthlyLaunchHours: 10,
    runningSandboxLimit: 1,
    storedSandboxLimit: 1,
    allowedSandboxTiers: ['launch'],
    gpuEnabled: false,
    idleTimeoutMinutes: 15,
    isFree: true,
  },
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
    idleTimeoutMinutes: 30,
    isFree: false,
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
    idleTimeoutMinutes: 60,
    isFree: false,
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
    idleTimeoutMinutes: 120,
    isFree: false,
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

export const DISK_INCLUDED_GIB = 10;
export const DISK_RATE_PER_GIB_MONTH = 0.12;
export const DISK_MIN_GIB = 10;
export const DISK_MAX_GIB = 500;

export const DISK_PRESETS = [
  { gib: 10,  label: '10 GiB',  tag: 'Included' },
  { gib: 25,  label: '25 GiB',  tag: null },
  { gib: 50,  label: '50 GiB',  tag: null },
  { gib: 100, label: '100 GiB', tag: null },
  { gib: 200, label: '200 GiB', tag: null },
] as const;

export function extraStorageCostPerMonth(diskGiB: number): number {
  return Math.max(0, diskGiB - DISK_INCLUDED_GIB) * DISK_RATE_PER_GIB_MONTH;
}

export const GPU_ADDON_TIERS = {
  'rtx-pro-6000': {
    id: 'rtx-pro-6000',
    label: 'Nvidia RTX PRO 6000',
    price: '$4.75/hr',
    ratePerHour: 4.75,
    requiredPlans: ['pro', 'team'] as CloudPlanId[],
  },
  'h100': {
    id: 'h100',
    label: 'Nvidia H100',
    price: '$5.95/hr',
    ratePerHour: 5.95,
    requiredPlans: ['pro', 'team'] as CloudPlanId[],
  },
} as const;

export type GpuAddonTier = keyof typeof GPU_ADDON_TIERS;

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active']);

export function isCloudPlanId(value: string): value is CloudPlanId {
  return value in CLOUD_PLANS;
}

export function isSandboxSizeTier(value: string): value is SandboxSizeTier {
  return value in SANDBOX_SIZE_TIERS;
}

export function stripePriceIdForPlan(planId: CloudPlanId): string | null {
  const plan = CLOUD_PLANS[planId];
  if (plan.isFree) return null;
  const envName = plan.stripePriceEnv;
  return process.env[envName] || null;
}

export function planFromStripePriceId(priceId: string | null | undefined): CloudPlanId | null {
  if (!priceId) return null;

  for (const plan of Object.values(CLOUD_PLANS)) {
    if (plan.isFree) continue;
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

/** Credits consumed by a running sandbox session, in launch-hour units. */
export function sessionCredits(tierKey: SandboxSizeTier, startedAt: string): number {
  const multiplier = SANDBOX_SIZE_TIERS[tierKey]?.creditMultiplier ?? 1;
  const hoursElapsed = (Date.now() - new Date(startedAt).getTime()) / 3_600_000;
  return hoursElapsed * multiplier;
}
