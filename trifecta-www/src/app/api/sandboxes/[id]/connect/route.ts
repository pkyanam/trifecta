import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSandbox } from '@/lib/db';
import { getTrifectaUrl, toCloudflareProxyUrl } from '@/lib/daytona';
import { config } from '@/lib/config';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sandbox = await getSandbox(id, userId);
  if (!sandbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sandbox.daytona_sandbox_id) return NextResponse.json({ error: 'Sandbox not ready' }, { status: 400 });

  try {
    const rawTrifectaUrl = await getTrifectaUrl(sandbox.daytona_sandbox_id);
    const token = sandbox.pairing_token ?? '';

    // Use the Cloudflare proxy URL for browser clients (strips Origin header so
    // Daytona doesn't intercept with its auth wall). Falls back to the raw Daytona
    // URL if NEXT_PUBLIC_CF_PROXY_DOMAIN is not set.
    const proxiedTrifectaUrl = toCloudflareProxyUrl(rawTrifectaUrl);

    // Native pairing URL (iOS / Android / desktop apps).
    // Native clients use the raw Daytona URL — they don't send Origin headers
    // so they already pass through fine without the Cloudflare proxy.
    const pairingUrl = new URL(`${rawTrifectaUrl}/pair`);
    pairingUrl.hash = new URLSearchParams({ token }).toString();

    // Web browser pairing URL — opens app.trifecta.belweave.com.
    // Pass the Cloudflare-proxied server URL so browser requests get CORS headers.
    const webPairingUrl = new URL(`${config.app.webAppUrl}/pair`);
    webPairingUrl.searchParams.set('host', proxiedTrifectaUrl);
    webPairingUrl.searchParams.set('label', sandbox.name);
    webPairingUrl.hash = new URLSearchParams({ token }).toString();

    return NextResponse.json({
      trifectaUrl: proxiedTrifectaUrl,
      rawTrifectaUrl,
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
