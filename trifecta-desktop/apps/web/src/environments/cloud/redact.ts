/**
 * Redaction helpers for Belweave Cloud diagnostics.
 *
 * Belweave Cloud credentials (API key, one-time pairing credentials, hosted
 * port `_token` / `_port_auth` values) must never appear in logs. These helpers
 * keep enough of a value to be recognizable for debugging while removing the
 * sensitive payload.
 */

const REDACTED = "[redacted]";

/** Case-insensitive object keys whose values are always fully redacted. */
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "token",
  "bearertoken",
  "bearer_token",
  "credential",
  "pairingcredential",
  "pairing_credential",
  "pairingurl",
  "pairing_url",
  "_token",
  "_port_auth",
  "secret",
]);

/** Query/hash params stripped from URLs before logging. */
const SENSITIVE_URL_PARAMS = ["_token", "_port_auth", "token", "wsToken"];

/**
 * Mask a secret string, preserving a short recognizable prefix (e.g. `bw_`)
 * without leaking the sensitive remainder.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) {
    return REDACTED;
  }
  const underscoreIndex = value.indexOf("_");
  const prefix =
    underscoreIndex > 0 && underscoreIndex <= 6 ? value.slice(0, underscoreIndex + 1) : "";
  return `${prefix}${REDACTED}`;
}

/**
 * Remove secret query params and any URL fragment (pairing URLs carry the
 * credential in the `#token=` fragment) so the URL is safe to log.
 */
export function redactUrlSecrets(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const param of SENSITIVE_URL_PARAMS) {
      url.searchParams.delete(param);
    }
    url.hash = "";
    return url.toString();
  } catch {
    // Not a parseable URL; strip anything after a `#` defensively.
    return rawUrl.split("#")[0] ?? rawUrl;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-redact a value for logging: sensitive keys are replaced wholesale and
 * string values that look like URLs have their secret params stripped.
 */
export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactForLog(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTED;
      } else {
        result[key] = redactForLog(entry);
      }
    }
    return result;
  }
  if (typeof value === "string" && /^[a-z][a-z\d+.-]*:\/\//iu.test(value)) {
    return redactUrlSecrets(value);
  }
  return value;
}
