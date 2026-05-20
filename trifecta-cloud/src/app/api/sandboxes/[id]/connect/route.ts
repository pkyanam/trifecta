import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSandbox } from '@/lib/db';
import { getTrifectaUrl } from '@/lib/daytona';
import { config } from '@/lib/config';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });

  try {
    const trifectaUrl = await getTrifectaUrl(sandbox.daytona_sandbox_id);

    // Build the pairing URL pointing to the production web app, not the Daytona server directly
    const pairingUrl = new URL(`${config.app.webAppUrl}/pair`);
    pairingUrl.searchParams.set('token', sandbox.pairing_token ?? '');
    pairingUrl.searchParams.set('server', trifectaUrl);

    return NextResponse.json({
      trifectaUrl,
      pairingUrl: pairingUrl.toString(),
      pairingToken: sandbox.pairing_token,
      status: sandbox.status,
    });
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
