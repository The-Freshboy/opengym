export function createRateLimiter({ now = Date.now } = {}) {
  const buckets = new Map()
  return function check(key, limit, windowMs) {
    const time = now()
    let item = buckets.get(key)
    if (!item || item.reset <= time) item = { count: 0, reset: time + windowMs }
    item.count++
    buckets.set(key, item)
    return item.count <= limit ? null : Math.max(1, Math.ceil((item.reset - time) / 1000))
  }
}
