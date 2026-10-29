/** Small in-memory fixed-window rate limiter (single-instance deployment). */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Returns true if the action is allowed and records the attempt. */
    check(key: string, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 10_000) {
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        }
        return true;
      }
      entry.count++;
      return entry.count <= limit;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
