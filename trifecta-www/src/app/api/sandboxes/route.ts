import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllSandboxes, createSandbox as dbCreateSandbox, getCloudAccount, updateSandbox, finishSandboxUsageSession, startSandboxUsageSession } from '@/lib/db';
import { createSandbox as daytonaCreateSandbox, getSandboxStatus } from '@/lib/daytona';
import { SandboxTier } from '@/lib/config';
import { getIsAdmin } from '@/lib/admin';
import { canCreateSandbox } from '@/lib/cloud-access';
import { isCloudPlanId, CLOUD_PLANS, DISK_MIN_GIB, DISK_MAX_GIB } from '@/lib/billing';
import { z } from 'zod';
import crypto from 'crypto';

// Sandbox creation can take up to ~2 minutes (Daytona boot + trifecta health wait).
export const maxDuration = 300;

// Sandboxes that have been "running" in our DB but haven't had a DB update in
// this many milliseconds are candidates for a lazy Daytona status check.
// Covers the gap between the daily cron runs when Daytona idle-stops a sandbox.
const STALE_RUNNING_MS = 60 * 60 * 1000; // 1 hour

const createSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
  tier: z.enum(['launch', 'build', 'max-cpu'] as const),
  gpuAddon: z.enum(['rtx-pro-6000', 'h100'] as const).nullable().optional(),
  diskGiB: z.number().int().min(DISK_MIN_GIB).max(DISK_MAX_GIB).optional().default(10),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sandboxes = await getAllSandboxes(userId);

    // Lazy background sync: any sandbox that is "running" in our DB but hasn't
    // been updated in a while may have been idle-stopped by Daytona. Check it
    // now so the user sees current status without waiting for the daily cron.
    const staleRunning = sandboxes.filter(
      (s) =>
        s.status === 'running' &&
        s.daytona_sandbox_id &&
        Date.now() - new Date(s.updated_at).getTime() > STALE_RUNNING_MS,
    );

    if (staleRunning.length > 0) {
      after(
        Promise.allSettled(
          staleRunning.map(async (sandbox) => {
            const info = await getSandboxStatus(sandbox.daytona_sandbox_id!);
            const state = info.state.toLowerCase();
            if (state === 'stopped' || state === 'archived') {
              await finishSandboxUsageSession(sandbox).catch((e) =>
                console.error(`[list] Failed to record usage for ${sandbox.id}:`, e),
              );
              await updateSandbox(sandbox.id, sandbox.user_id, { status: 'stopped', started_at: null });
            }
          }),
        ),
      );
    }

    return NextResponse.json({ sandboxes });
  } catch (error) {
    console.error('Failed to list sandboxes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, tier, gpuAddon, diskGiB } = createSchema.parse(body);
    const pairingToken = crypto.randomBytes(9).toString('base64url');
    const [isAdmin, account, existingSandboxes] = await Promise.all([
      getIsAdmin(),
      getCloudAccount(userId),
      getAllSandboxes(userId),
    ]);

    const access = canCreateSandbox({
      account,
      isAdmin,
      requestedTier: tier,
      existingSandboxes,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (gpuAddon && !isAdmin && !account?.gpu_enabled) {
      return NextResponse.json({ error: 'GPU add-ons are available on Pro and Team plans.' }, { status: 403 });
    }

    const record = await dbCreateSandbox({ name, tier, disk_gib: diskGiB, gpu_addon: gpuAddon ?? null, pairing_token: pairingToken, user_id: userId });

    const planId = account?.plan && isCloudPlanId(account.plan) ? account.plan : null;
    const idleTimeoutMinutes = (planId ? CLOUD_PLANS[planId].idleTimeoutMinutes : null)
      ?? account?.idle_timeout_minutes
      ?? 15;

    const gpuCount = gpuAddon ? 1 : 0;

    after(
      daytonaCreateSandbox({ name, tier: tier as SandboxTier, pairingToken, idleTimeoutMinutes, gpuCount, diskGiB })
        .then(async (info) => {
          const startedAt = new Date().toISOString();
          await updateSandbox(record.id, userId, {
            daytona_sandbox_id: info.daytonaSandboxId,
            status: 'running',
            started_at: startedAt,
          });
          await startSandboxUsageSession({ ...record, daytona_sandbox_id: info.daytonaSandboxId, status: 'running', started_at: startedAt }, startedAt);
        })
        .catch((err) => {
          console.error('Background sandbox creation failed:', err);
          updateSandbox(record.id, userId, { status: 'error' });
        })
    );

    return NextResponse.json({ sandbox: record });
  } catch (error) {
    console.error('Failed to create sandbox:', error);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
