import { NextResponse } from 'next/server';
import { getAllRunningSandboxes, updateSandbox, addRuntimeCreditsUsed } from '@/lib/db';
import { getSandboxStatus } from '@/lib/daytona';
import { isSandboxSizeTier, sessionCredits } from '@/lib/billing';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const runningSandboxes = await getAllRunningSandboxes();

  let synced = 0;
  let credited = 0;

  await Promise.allSettled(
    runningSandboxes.map(async (sandbox) => {
      if (!sandbox.daytona_sandbox_id) return;

      const statusInfo = await getSandboxStatus(sandbox.daytona_sandbox_id);
      const rawState = statusInfo.state.toLowerCase();

      // Daytona stopped the sandbox (idle auto-stop or manual)
      if (rawState === 'stopped' || rawState === 'archived') {
        const tierKey = isSandboxSizeTier(sandbox.tier) ? sandbox.tier : 'launch';
        const credits = sandbox.started_at ? sessionCredits(tierKey, sandbox.started_at) : 0;

        await updateSandbox(sandbox.id, sandbox.user_id, {
          status: 'stopped',
          started_at: null,
        });

        if (credits > 0) {
          await addRuntimeCreditsUsed(sandbox.user_id, credits).catch((e) =>
            console.error(`[cron/usage] Failed to deduct credits for ${sandbox.id}:`, e)
          );
          credited++;
        }
        synced++;
      }
    })
  );

  return NextResponse.json({ ok: true, checked: runningSandboxes.length, synced, credited });
}
