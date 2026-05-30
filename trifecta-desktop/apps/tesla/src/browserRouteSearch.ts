export interface BrowserRouteSearch {
  browser?: "1" | undefined;
}

function isBrowserOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

export function stripBrowserSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "browser"> {
  const { browser: _browser, ...rest } = params;
  return rest as Omit<T, "browser">;
}

export function parseBrowserRouteSearch(search: Record<string, unknown>): BrowserRouteSearch {
  const browser = isBrowserOpenValue(search.browser) ? "1" : undefined;

  return browser ? { browser } : {};
}
