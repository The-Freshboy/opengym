// Shared browser-write policy. Bearer-only integration requests have their own boundary.
export function browserWriteError(req, origin) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return null
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return { status: 415, error: 'JSON content type required' }
  if (req.headers.cookie && /(?:^|;\s*)gymsid=/.test(req.headers.cookie) && req.headers.origin !== origin) return { status: 403, error: 'same-origin browser request required' }
  if (req.headers.origin && req.headers.origin !== origin && !req.headers.authorization) return { status: 403, error: 'origin not allowed' }
  return null
}

export function stateInputError(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'state must be an object'
  const bounds = { routines: 500, customEx: 1000, workouts: 20000, bodyweight: 20000, goals: 200, goalResults: 5000, trainingBlocks: 500 }
  for (const [key, max] of Object.entries(bounds)) if (state[key] !== undefined && (!Array.isArray(state[key]) || state[key].length > max)) return `${key} must be an array with at most ${max} entries`
  for (const key of ['week', 'dayPlan', 'exWeights', 'readiness']) if (state[key] !== undefined && (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key]) || Object.keys(state[key]).length > 20000)) return `invalid ${key}`
  if ((state.routines || []).some(r => !r || typeof r !== 'object' || !Array.isArray(r.ex) || r.ex.length > 100)) return 'invalid routine exercises'
  return null
}

export function clientAddress(req, trustProxy = false) {
  return trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() : req.socket.remoteAddress || 'unknown'
}
