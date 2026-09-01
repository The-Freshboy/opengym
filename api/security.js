import net from 'node:net';

const PUSH_HOSTS = [
  'fcm.googleapis.com', 'updates.push.services.mozilla.com',
  'web.push.apple.com', 'push.apple.com'
];

export function originAllowed(req, expectedOrigin) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(expectedOrigin).origin; }
  catch { return false; }
}

export function jsonContentTypeAllowed(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  return /^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''));
}

export function validPushSubscription(sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return false;
  try {
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return false;
    if (sub.endpoint.length > 2048 || sub.keys.p256dh.length > 512 || sub.keys.auth.length > 256) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (net.isIP(host)) return false;
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    return PUSH_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed));
  } catch { return false; }
}

export function createRateLimiter({ windowMs, max, maxEntries = 10000 }) {
  const buckets = new Map();
  return key => {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset <= now) b = { count: 0, reset: now + windowMs };
    b.count++;
    buckets.set(key, b);
    if (buckets.size > maxEntries) {
      for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
      while (buckets.size > maxEntries) buckets.delete(buckets.keys().next().value);
    }
    return { allowed: b.count <= max, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  };
}
