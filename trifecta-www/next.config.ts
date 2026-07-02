import type { NextConfig } from "next";

/**
 * Build a Content-Security-Policy header value from environment variables.
 *
 * Domains are derived from NEXT_PUBLIC_* env vars so the CSP adapts to the
 * deployment environment (production vs. preview vs. local). Every directive
 * defaults to 'self' and only widens for the specific third-party origins the
 * app actually needs.
 */
function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;
  const proxyDomain = process.env.NEXT_PUBLIC_CF_PROXY_DOMAIN; // e.g. sbx.belweave.com

  // Clerk frontend API origin is derived from the publishable key
  // (pk_test_xxx → https://xxx.clerk.accounts.dev, or a custom domain).
  // We extract it at runtime from the key prefix, but for the CSP header
  // (which is set at build/start time) we use a conservative allowlist.
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  // Allow an explicit Clerk Frontend API domain via env override for
  // production (pk_live_) deployments that use a custom domain.
  const clerkCustomDomain = process.env.CLERK_CSP_ORIGIN ?? "";
  let clerkOrigin = "";
  if (clerkCustomDomain) {
    clerkOrigin = clerkCustomDomain;
  } else if (clerkPublishableKey.startsWith("pk_")) {
    // pk_test_|pk_live_  →  <key-id>.clerk.accounts.dev  (or custom domain)
    // The key format is pk_<env>_<id>; Clerk's frontend API is at
    // https://<id>.clerk.accounts.dev (test) or the custom domain (live).
    // We can't reliably parse the exact origin from the key alone, so we
    // allow clerk.accounts.dev and any custom Clerk domain via env override.
    clerkOrigin = "https://*.clerk.accounts.dev";
  }

  const connectSources = [
    "'self'",
    clerkOrigin,
    supabaseHost ? `https://${supabaseHost}` : "https://*.supabase.co",
    "https://api.stripe.com",
    "https://app.daytona.io",
  ].filter(Boolean);

  const frameSources = [
    "'self'",
    proxyDomain ? `https://*.${proxyDomain}` : "",
    "https://app.daytona.io",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${clerkOrigin}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    `connect-src ${connectSources.join(" ")}`,
    `frame-src ${frameSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
  ]
    .join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const csp = buildCsp();
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
