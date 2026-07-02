# FINDING-014 — WebView security misconfigurations in SSH terminal

| Field | Value |
|-------|-------|
| Severity | High |
| Category | WebView Security |
| Component | trifecta-mobile/src/app/ssh-terminal.tsx |
| Status | Fixed |

## Description

The SSH terminal WebView had several security issues:

1. `originWhitelist={['*']}` — allowed navigation to any origin
2. `mixedContentMode="compatibility"` — allowed mixed HTTP/HTTPS content on Android
3. No `onShouldStartLoadWithRequest` validation — no navigation restriction
4. No Content-Security-Policy in the WebView HTML — no script injection protection

The WebView loads xterm.js from `cdn.jsdelivr.net`. A compromised CDN or
injected terminal output could execute arbitrary JavaScript in the WebView
context and exfiltrate terminal contents.

## Fix

1. Removed `originWhitelist={['*']}` (not needed for static HTML source)
2. Removed `mixedContentMode="compatibility"` (defaults to `never` on Android)
3. Added `onShouldStartLoadWithRequest` that only allows `about:blank` (the
   URL used for static HTML source), blocking all external navigation
4. Added a Content-Security-Policy meta tag to the WebView HTML:
   ```
   default-src 'none';
   script-src https://cdn.jsdelivr.net 'unsafe-inline';
   style-src https://cdn.jsdelivr.net 'unsafe-inline';
   img-src data:;
   connect-src 'none';
   ```
   This restricts script/style loading to only the jsdelivr CDN and inline
   scripts, blocks all network connections from the WebView, and disables
   all other resource types.
