import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudAccount, getAllSandboxes } from '@/lib/db';
import { getIsAdmin } from '@/lib/admin';
import { GPU_ADDON_TIERS, isSandboxSizeTier, sessionCredits, sessionGpuCost, type GpuAddonTier } from '@/lib/billing';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [account, isAdmin, sandboxes] = await Promise.all([
    getCloudAccount(userId),
    getIsAdmin(),
    getAllSandboxes(userId),
  ]);

  // Sum credits currently burning in running sessions
  const liveCredits = sandboxes
    .filter((s) => s.status === 'running' && s.started_at)
    .reduce((sum, s) => {
      const tierKey = isSandboxSizeTier(s.tier) ? s.tier : 'launch';
      return sum + sessionCredits(tierKey, s.started_at!);
    }, 0);
  const liveGpuCostUsd = sandboxes
    .filter((s) => s.status === 'running' && s.started_at && s.gpu_addon && s.gpu_addon in GPU_ADDON_TIERS)
    .reduce((sum, s) => sum + sessionGpuCost(s.gpu_addon as GpuAddonTier, s.started_at!), 0);

  const creditsUsedTotal = (account?.runtime_credits_used ?? 0) + liveCredits;
  const creditsTotal = account?.runtime_credits_monthly ?? 0;
  const creditsRemaining = Math.max(0, creditsTotal - creditsUsedTotal);
  const gpuUsageUsdTotal = (account?.gpu_usage_usd ?? 0) + liveGpuCostUsd;

  return NextResponse.json({
    account,
    isAdmin,
    creditsUsedTotal,
    creditsRemaining,
    creditsTotal,
    gpuUsageUsdTotal,
  });
}
