import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Contact relay for preetham.org → Poke.
 *
 * The Mintlify contact form (preetham.org/contact) can't hold the Poke API key
 * (it would ship to the browser), so it POSTs here. This route holds the key
 * server-side and forwards a single message to Poke's API Message endpoint.
 * Set POKE_API_KEY to a V2 API key created in Poke Kitchen.
 */

const POKE_API_MESSAGE_ENDPOINT = 'https://poke.com/api/v1/inbound/api-message';

const ALLOWED_ORIGINS = (
  process.env.CONTACT_ALLOWED_ORIGINS || 'https://preetham.org,https://www.preetham.org'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Best-effort in-memory rate limit (per warm instance — not a hard guarantee
// across serverless instances). Honeypot + length caps do the heavier lifting.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');

  // Defense in depth: block browser requests from non-allowlisted origins.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return reply({ ok: false, error: 'forbidden origin' }, 403, origin);
  }

  if (!process.env.POKE_API_KEY) {
    return reply({ ok: false, error: 'relay not configured' }, 500, origin);
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return reply({ ok: false, error: 'too many requests' }, 429, origin);
  }

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return reply({ ok: false, error: 'invalid json' }, 400, origin);
  }

  // Honeypot: humans never fill `company`. Return 200 so bots learn nothing.
  if (typeof data.company === 'string' && data.company.trim() !== '') {
    return reply({ ok: true }, 200, origin);
  }

  const name = String(data.name ?? '').trim().slice(0, 100);
  const email = String(data.email ?? '').trim().slice(0, 200);
  const message = String(data.message ?? '').trim().slice(0, 4000);
  const source = String(data.source ?? 'preetham.org/contact').trim().slice(0, 200);

  if (!name || !email || !message) {
    return reply({ ok: false, error: 'missing fields' }, 400, origin);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply({ ok: false, error: 'invalid email' }, 400, origin);
  }

  const text = `📬 new message from preetham.org\n\nfrom: ${name} <${email}>\n\n${message}`;
  let pokeResponse: unknown = null;

  try {
    const res = await fetch(POKE_API_MESSAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.POKE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: text,
        contact: { name, email, message, source },
      }),
    });
    pokeResponse = await readJson(res);
    if (!res.ok) {
      return reply({ ok: false, error: 'delivery failed' }, 502, origin);
    }
    if (
      typeof pokeResponse !== 'object' ||
      pokeResponse === null ||
      !('success' in pokeResponse) ||
      pokeResponse.success !== true
    ) {
      return reply({ ok: false, success: false, error: 'delivery not confirmed' }, 502, origin);
    }
  } catch {
    return reply({ ok: false, error: 'delivery failed' }, 502, origin);
  }

  return reply({ ok: true, success: true }, 200, origin);
}
