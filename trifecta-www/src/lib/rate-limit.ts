export function rateLimit(opts: { interval: number; limit: number }) {
  const cache = new Map<string, { count: number; resetTime: number }>();

  return function (key: string) {
    const now = Date.now();
    const record = cache.get(key);

    if (record) {
      if (now > record.resetTime) {
        // Expired, reset
        cache.set(key, { count: 1, resetTime: now + opts.interval });
        return { success: true, remaining: opts.limit - 1 };
      }

      if (record.count >= opts.limit) {
        return { success: false, remaining: 0 };
      }

      // Increment
      record.count += 1;
      return { success: true, remaining: opts.limit - record.count };
    }

    // New entry
    cache.set(key, { count: 1, resetTime: now + opts.interval });
    return { success: true, remaining: opts.limit - 1 };
  };
}
