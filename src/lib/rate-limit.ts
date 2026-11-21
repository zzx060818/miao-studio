export type Buckets = {
  ip: Map<string, number[]>;
  global: Map<string, number[]>;
};

export function takeToken(
  bucket: Map<string, number[]>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const fresh = (bucket.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (fresh.length >= limit) {
    bucket.set(key, fresh);
    return false;
  }
  fresh.push(now);
  bucket.set(key, fresh);
  if (bucket.size > 5000) {
    for (const [name, stamps] of bucket) {
      if (stamps.every((stamp) => now - stamp >= windowMs)) bucket.delete(name);
    }
  }
  return true;
}
