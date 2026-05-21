import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSandbox, updateSandbox, addRuntimeCreditsUsed } from '@/lib/db';
import { stopSandbox as daytonaStopSandbox } from '@/lib/daytona';
import { isSandboxSizeTier, sessionCredits } from '@/lib/billing';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });

  try {
    await daytonaStopSandbox(sandbox.daytona_sandbox_id);

    const tierKey = isSandboxSizeTier(sandbox.tier) ? sandbox.tier : 'launch';
    const credits = sandbox.started_at ? sessionCredits(tierKey, sandbox.started_at) : 0;
    const updates: Record<string, unknown> = { status: 'stopped', started_at: null };

    await updateSandbox(id, userId, updates);
    if (credits > 0) {
      await addRuntimeCreditsUsed(userId, credits).catch((e) =>
        console.error('Failed to deduct credits on stop:', e)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to stop sandbox:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
