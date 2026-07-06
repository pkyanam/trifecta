export interface BoxPortAuth {
  readonly token: string;
  readonly cookieHeader: string;
}

function isValidCookieValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || value[index] === ";") return false;
  }
  return true;
}

export function extractBoxPortAuth(url: URL): BoxPortAuth | null {
  const token = url.searchParams.get("_token");
  if (!token) return null;
  if (!isValidCookieValue(token)) return null;
  return {
    token,
    cookieHeader: `_port_auth=${encodeURIComponent(token)}`,
  };
}

export function stripBoxToken(url: URL): URL {
  const next = new URL(url.toString());
  next.searchParams.delete("_token");
  return next;
}
