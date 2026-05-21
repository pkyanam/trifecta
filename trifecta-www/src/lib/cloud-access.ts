import { ACTIVE_SUBSCRIPTION_STATUSES, canUseSandboxTier, isCloudPlanId, type SandboxSizeTier } from './billing';
import type { CloudAccount, SandboxRecord } from './types';

export function hasActiveCloudAccess(account: CloudAccount | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return ACTIVE_SUBSCRIPTION_STATUSES.has(account?.subscription_status ?? '');
}

export function canCreateSandbox(opts: {
  account: CloudAccount | null;
  isAdmin: boolean;
  requestedTier: SandboxSizeTier;
  existingSandboxes: SandboxRecord[];
}): { ok: true } | { ok: false; status: number; error: string } {
  if (opts.isAdmin) return { ok: true };

  if (!hasActiveCloudAccess(opts.account, false)) {
    return { ok: false, status: 402, error: 'Choose a cloud plan before creating sandboxes.' };
  }

  const plan = opts.account?.plan && isCloudPlanId(opts.account.plan) ? opts.account.plan : null;
  if (!canUseSandboxTier(plan, opts.requestedTier)) {
    return { ok: false, status: 403, error: 'This sandbox size is not included in your current plan.' };
  }

  if (opts.existingSandboxes.length >= (opts.account?.stored_sandbox_limit ?? 0)) {
    return { ok: false, status: 403, error: 'You have reached your stored sandbox limit.' };
  }

  const runningCount = opts.existingSandboxes.filter((sandbox) => sandbox.status === 'running').length;
  if (runningCount >= (opts.account?.running_sandbox_limit ?? 0)) {
    return { ok: false, status: 403, error: 'You have reached your running sandbox limit.' };
  }

  return { ok: true };
}

export function canStartSandbox(opts: {
  account: CloudAccount | null;
  isAdmin: boolean;
  sandbox: SandboxRecord;
  existingSandboxes: SandboxRecord[];
}): { ok: true } | { ok: false; status: number; error: string } {
  if (opts.isAdmin) return { ok: true };

  if (!hasActiveCloudAccess(opts.account, false)) {
    return { ok: false, status: 402, error: 'Choose a cloud plan before starting sandboxes.' };
  }

  const runningCount = opts.existingSandboxes.filter((sandbox) => sandbox.status === 'running').length;
  if (opts.sandbox.status !== 'running' && runningCount >= (opts.account?.running_sandbox_limit ?? 0)) {
    return { ok: false, status: 403, error: 'You have reached your running sandbox limit.' };
  }

  return { ok: true };
}
