/** In-memory sliding window. Enough for a single Vercel instance / local demo. */
export const INTERPRET_RATE_LIMIT = 10;
export const INTERPRET_RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** True when this IP still has a slot in the current window. */
export function takeInterpretSlot(ip: string, now = Date.now()) {
  const windowStart = now - INTERPRET_RATE_WINDOW_MS;
  const stamps = (hits.get(ip) ?? []).filter((stamp) => stamp > windowStart);
  if (stamps.length >= INTERPRET_RATE_LIMIT) {
    hits.set(ip, stamps);
    return false;
  }
  stamps.push(now);
  hits.set(ip, stamps);
  if (hits.size > 4_000) pruneInterpretSlots(now);
  return true;
}

export function resetInterpretRateLimit() {
  hits.clear();
}

function pruneInterpretSlots(now: number) {
  const windowStart = now - INTERPRET_RATE_WINDOW_MS;
  for (const [ip, stamps] of hits) {
    const keep = stamps.filter((stamp) => stamp > windowStart);
    if (keep.length) hits.set(ip, keep);
    else hits.delete(ip);
  }
}
