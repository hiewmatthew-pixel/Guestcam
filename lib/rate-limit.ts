// Lightweight in-memory rate limiter for server actions. Keyed by an
// arbitrary string (e.g. `portal:<slug>` or `admin-login`).
//
// NOTE: state lives in the module scope of a single server instance. On
// a serverless platform (Vercel) each warm instance keeps its own
// window, so a determined attacker spread across many cold starts gets
// more attempts than the nominal limit. It is still a meaningful first
// line of defence against the common case (one client hammering one
// endpoint) and adds zero infra. For hard guarantees, back this with
// Upstash Redis or the platform's edge rate limiter and keep the same
// call signature.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// opportunistic cleanup so the map doesn't grow unbounded
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Allow up to `limit` calls per `windowMs` for a given key.
 * Returns { allowed:false } once the window's budget is exhausted.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}
