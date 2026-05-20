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
    const token = sandbox.pairing_token ?? '';

    // Native pairing URL (iOS / Android / desktop apps).
    // The app parses the base URL as the server and ?token= as the token.
    const pairingUrl = new URL(`${trifectaUrl}/pair`);
    pairingUrl.searchParams.set('token', token);

    // Web browser pairing URL — opens app.trifecta.belweave.com.
    // The hosted web app expects ?host=<server>&label=<name>#token=<token>
    // (token in the fragment so it isn't sent to the server in Referer headers).
    const webPairingUrl = new URL(`${config.app.webAppUrl}/pair`);
    webPairingUrl.searchParams.set('host', trifectaUrl);
    webPairingUrl.searchParams.set('label', sandbox.name);
    webPairingUrl.hash = `token=${token}`;

    return NextResponse.json({
      trifectaUrl,
      pairingUrl: pairingUrl.toString(),
      webPairingUrl: webPairingUrl.toString(),
      pairingToken: token,
      status: sandbox.status,
    });
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
