import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllSandboxes, getCloudAccount, getSandbox, startSandboxUsageSession, updateSandbox } from '@/lib/db';
import { startSandbox as daytonaStartSandbox } from '@/lib/daytona';
import { getIsAdmin } from '@/lib/admin';
import { canStartSandbox } from '@/lib/cloud-access';
import { isCloudPlanId, CLOUD_PLANS } from '@/lib/billing';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });
  if (!sandbox.pairing_token) return NextResponse.json({ error: 'Sandbox missing pairing token' }, { status: 400 });

  try {
    const [isAdmin, account, existingSandboxes] = await Promise.all([
      getIsAdmin(),
      getCloudAccount(userId),
      getAllSandboxes(userId),
    ]);
    const access = canStartSandbox({ account, isAdmin, sandbox, existingSandboxes });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const planId = account?.plan && isCloudPlanId(account.plan) ? account.plan : null;
    const idleTimeoutMinutes = (planId ? CLOUD_PLANS[planId].idleTimeoutMinutes : null)
      ?? account?.idle_timeout_minutes
      ?? 15;

    await daytonaStartSandbox(sandbox.daytona_sandbox_id, sandbox.pairing_token, idleTimeoutMinutes);
    const startedAt = new Date().toISOString();
    await updateSandbox(id, userId, { status: 'running', started_at: startedAt });
    await startSandboxUsageSession({ ...sandbox, status: 'running', started_at: startedAt }, startedAt);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to start sandbox:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
