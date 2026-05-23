import { NextResponse } from 'next/server';
import { finishSandboxUsageSession, getAllRunningSandboxes, updateSandbox } from '@/lib/db';
import { getSandboxStatus } from '@/lib/daytona';

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
        const usage = await finishSandboxUsageSession(sandbox).catch((e) => {
          console.error(`[cron/usage] Failed to record usage for ${sandbox.id}:`, e);
          return null;
        });

        await updateSandbox(sandbox.id, sandbox.user_id, {
          status: 'stopped',
          started_at: null,
        });

        if (usage && usage.launchHours > 0) {
          credited++;
        }
        synced++;
      }
    })
  );

  return NextResponse.json({ ok: true, checked: runningSandboxes.length, synced, credited });
}
