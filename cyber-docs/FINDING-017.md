# FINDING-017 — Missing CSP and security headers in trifecta-www

| Field | Value |
|-------|-------|
| Severity | Medium |
| Category | Hardening |
| Component | trifecta-www/next.config.ts |
| Status | Fixed |

## Description

The trifecta-www Next.js app had minimal security headers configured — only
`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. It was
missing:

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- frame-ancestors restriction

Without CSP, any XSS vulnerability (via dependency or user input) could
exfiltrate user data. Without X-Frame-Options/frame-ancestors, the app could
be framed in a clickjacking attack.

## Fix

Added comprehensive security headers to `next.config.ts`:

1. **Content-Security-Policy**: Environment-aware CSP that allows only the
   origins the app actually needs (Clerk, Supabase, Stripe, Daytona, Google
   Fonts). Uses `NEXT_PUBLIC_*` env vars to derive domains so the CSP adapts
   to the deployment environment. Includes `object-src 'none'`,
   `base-uri 'self'`, `frame-ancestors 'none'`.

2. **Strict-Transport-Security**: `max-age=31536000; includeSubDomains; preload`

3. **X-Frame-Options**: `DENY` (defense-in-depth alongside CSP
   `frame-ancestors 'none'`)

The CSP uses `'unsafe-inline'` and `'unsafe-eval'` for `script-src` because
Next.js and Clerk inject inline scripts. A future improvement would be to
use nonce-based CSP with Next.js's built-in nonce support.
