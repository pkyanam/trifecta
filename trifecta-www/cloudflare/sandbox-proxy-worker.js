/**
 * Cloudflare Worker: path-based CORS + WebSocket proxy for Daytona sandboxes.
 *
 * Route: sbx.belweave.com/*
 * DNS:   sbx AAAA 100:: (Proxied)
 *
 * URL layout:
 *   https://sbx.belweave.com/<sandbox-host>/.well-known/belweave/environment
 *   wss://sbx.belweave.com/<sandbox-host>/?wsToken=...
 *
 * Important: return the upstream fetch() response directly for WebSocket
 * upgrades. Wrapping it in new Response(body, upstream) strips webSocket.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return new Response("Usage: sbx.belweave.com/<sandbox-id>/path", { status: 400 });
    }

    const sandboxHost = parts[0];
    const remainingPath = "/" + parts.slice(1).join("/");
    const daytonaUrl = `https://${sandboxHost}.daytonaproxy01.net${remainingPath}${url.search}`;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, b3, traceparent",
      "Access-Control-Max-Age": "600",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const headers = new Headers(request.headers);
    headers.delete("origin");
    headers.set("X-Daytona-Skip-Preview-Warning", "true");

    const upstream = await fetch(daytonaUrl, {
      method: request.method,
      headers,
      body: request.body,
    });

    // WebSocket: must return upstream as-is (101 + webSocket), not a wrapped Response.
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return upstream;
    }

    const response = new Response(upstream.body, upstream);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  },
};
