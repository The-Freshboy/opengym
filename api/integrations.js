import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { validateReview } from './coach/validate.js'
import { cleanPlan } from './coach/payload.js'

// This boundary deliberately does not recognise cookies on external routes or bearer
// credentials on approval routes. A token can suggest changes, never approve them.
export const INTEGRATION_CHANGES = ['sets', 'reps', 'repsMin', 'sec', 'cardio', 'exercise-prog', 'routine-prog', 'inc', 'rename-routine', 'add-exercise', 'remove-exercise', 'swap-exercise', 'week']
const DAY = 86400000
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]))
const scalars = (o, keys) => Object.fromEntries(keys.filter(k => ['string', 'number', 'boolean'].includes(typeof o?.[k])).map(k => [k, typeof o[k] === 'string' ? o[k].slice(0, 2000) : o[k]]))
const hash = s => crypto.createHash('sha256').update(s).digest('hex')
const id = () => crypto.randomBytes(16).toString('hex')
class IntegrationError extends Error { constructor(status, message) { super(message); this.status = status } }
const reject = (status, message) => { throw new IntegrationError(status, message) }

export function integrationContext(state, revision, now = Date.now()) {
  const cutoff = new Date(now - 84 * DAY).toISOString().slice(0, 10)
  return {
    version: 1, revision, allowedChanges: INTEGRATION_CHANGES,
    plan: { ...cleanPlan(state), dayPlan: pick(state.dayPlan || {}, Object.keys(state.dayPlan || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= cutoff).slice(0, 366)) },
    customEx: (state.customEx || []).slice(0, 500).map(e => scalars(e, ['id', 'n', 'bp', 'eq', 'desc'])),
    workouts: (state.workouts || []).filter(w => w.d >= cutoff).slice(-60).map(w => ({
      ...scalars(w, ['id', 'd', 'routineId', 'name', 'note', 'notes', 'effort', 'rating', 'duration', 'short', 'variant', 'incomplete', 'unit']),
      feedback: scalars(w.feedback, ['jointDiscomfort', 'energy', 'difficulty', 'notes']),
      entries: (w.entries || []).slice(0, 100).map(e => ({ ...scalars(e, ['id', 'note', 'notes']), target: scalars(e.target, ['sets', 'reps', 'sec', 'min', 'speed', 'weight', 'mode', 'prog', 'inc']), sets: (e.sets || []).slice(0, 100).map(s => scalars(s, ['r', 'w', 'sec', 'min', 'speed', 'done', 'rir', 'rpe'])) }))
    })),
    profile: scalars(state.coach?.profile || {}, ['goal', 'experience', 'daysPerWeek', 'sessionMin', 'limitations', 'likes', 'dislikes', 'notes']),
    prefs: scalars(state, ['unit', 'lang', 'effort'])
  }
}

export function applyIntegrationChanges(state, changes) {
  const next = structuredClone(state)
  for (const c of changes) {
    const r = next.routines?.find(r => r.id === c.target.routineId)
    const e = r?.ex?.find(e => e.id === c.target.exId)
    if (c.type !== 'week' && !r) reject(400, 'routine no longer available')
    if (!['week', 'add-exercise', 'routine-prog', 'rename-routine'].includes(c.type) && !e) reject(400, 'exercise no longer available')
    if (['sets', 'reps', 'repsMin', 'sec', 'inc'].includes(c.type)) e[c.type] = c.after
    else if (c.type === 'exercise-prog') e.prog = c.after
    else if (c.type === 'routine-prog') r.prog = c.after
    else if (c.type === 'rename-routine') r.name = c.after
    else if (c.type === 'cardio') Object.assign(e, c.after)
    else if (c.type === 'week') {
      next.week ||= {}
      if (c.after === null || c.after === 'rest') delete next.week[c.target.weekday]
      else next.week[c.target.weekday] = c.after
    } else if (c.type === 'add-exercise') {
      if (r.ex.some(e => e.id === c.after.id) || r.ex.length >= 20) reject(400, 'duplicate exercise or routine limit')
      const a = c.after
      const added = { ...pick(a, ['id', 'sets', 'mode', 'weight', 'prog']), ...(a.mode === 'time' ? { sec: a.sec || 5 } : a.mode === 'cardio' ? { min: a.min || 20, speed: a.speed || 8 } : { reps: a.reps || 10 }) }
      r.ex.splice(Number.isInteger(a.position) ? a.position : r.ex.length, 0, added)
    } else if (c.type === 'remove-exercise') {
      if (e.mandatory || r.ex.length <= 1 || e.sg) reject(400, 'cannot remove protected, last or superset exercise')
      r.ex = r.ex.filter(x => x.id !== e.id)
    } else if (c.type === 'swap-exercise') {
      if (e.mandatory || e.sg || r.ex.some(x => x.id === c.after.id)) reject(400, 'cannot swap protected, superset or duplicate exercise')
      Object.assign(e, pick(c.after, ['id', 'sets', 'reps', 'weight']))
    } else reject(400, 'unsupported change')
  }
  // History, credentials and profile settings cannot be addressed by a change type.
  return next
}

export function integrationRoutes({ json, readBody, readSession, users, stateStore, dataDir, origin, enabled = false, now = Date.now }) {
  const respond = json
  json = (res, status, value, headers = {}) => respond(res, status, value, { 'Cache-Control': 'no-store', ...headers })
  const file = path.join(dataDir, 'integrations.json')
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return { tokens: [], proposals: [], audit: [] }; throw e } }
  const save = db => {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(db), { mode: 0o600 })
    fs.renameSync(file + '.tmp', file)
  }
  const audit = (db, uid, action, tokenId, proposalId) => {
    db.audit.push({ id: id(), uid, action, tokenId: tokenId || null, proposalId: proposalId || null, at: now() })
    db.audit = db.audit.slice(-1000)
  }
  const publicToken = t => pick(t, ['id', 'name', 'scopes', 'createdAt', 'expiresAt', 'lastUsedAt', 'revokedAt'])
  const valid = t => {
    const u = t && users().find(u => u.id === t.uid)
    return !!u && !u.disabled && !t.revokedAt && t.expiresAt > now() && t.sv === (u.sv || 0)
  }
  const limits = new Map()
  const limit = (key, max) => {
    const at = now(), existing = limits.get(key), b = !existing || at - existing.at >= 60000 ? { at, n: 0 } : existing
    if (++b.n > max) reject(429, 'too many requests; try again shortly')
    limits.set(key, b)
    if (limits.size > 1000) for (const [k, v] of limits) if (at - v.at >= 60000) limits.delete(k)
  }
  const session = (req, mutate = false) => {
    if (req.headers.authorization) reject(401, 'use a signed-in browser to manage integrations')
    const user = readSession(req)
    if (!user || user.disabled) reject(401, 'not signed in')
    if (mutate && req.headers.origin !== origin) reject(403, 'same-origin browser request required')
    limit('user:' + user.id, 40)
    return user
  }
  const bearer = (req, scope) => {
    // Rate-limit failed authentication without trusting a spoofable forwarded header.
    limit('ip:' + (req.socket?.remoteAddress || 'unknown'), 120)
    const raw = req.headers.authorization || ''
    if (!/^Bearer ogi_[A-Za-z0-9_-]{43}$/.test(raw)) reject(401, 'invalid integration credential')
    const digest = hash(raw.slice(7)), db = read()
    const t = db.tokens.find(t => t.digest.length === digest.length && crypto.timingSafeEqual(Buffer.from(t.digest), Buffer.from(digest)))
    if (!valid(t)) reject(401, 'invalid integration credential')
    if (!t.scopes.includes(scope)) reject(403, 'credential does not have this permission')
    limit('token:' + t.id, scope === 'propose' ? 10 : 60)
    t.lastUsedAt = now()
    return { db, t }
  }
  const wrap = fn => async (req, res) => {
    try { if (!enabled) reject(503, 'integrations are disabled on this server'); await fn(req, res) } catch (e) {
      if (e instanceof IntegrationError) return json(res, e.status, { error: e.message })
      if (e.name === 'StateConflict') return json(res, 409, { error: 'profile changed; refresh and request a new proposal' })
      throw e
    }
  }
  const body = async req => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) reject(415, 'JSON required')
    const b = await readBody(req)
    if (!b || Array.isArray(b) || typeof b !== 'object' || JSON.stringify(b).length > 65536) reject(400, 'invalid or oversized request')
    return b
  }
  const proposalFor = (db, uid, pid) => {
    const p = db.proposals.find(p => p.uid === uid && p.id === pid && p.status === 'pending')
    if (!p) reject(404, 'pending proposal not found')
    if (p.expiresAt <= now() || !valid(db.tokens.find(t => t.id === p.tokenId))) reject(409, 'proposal expired or access revoked')
    return p
  }
  const publicProposal = p => pick(p, ['id', 'tokenId', 'sourceName', 'revision', 'summary', 'changes', 'createdAt', 'expiresAt', 'status'])
  return {
    'GET /api/integrations': wrap((req, res) => {
      const u = session(req), db = read()
      json(res, 200, { tokens: db.tokens.filter(t => t.uid === u.id).map(publicToken), pending: db.proposals.filter(p => p.uid === u.id && p.status === 'pending' && p.expiresAt > now() && valid(db.tokens.find(t => t.id === p.tokenId))).map(publicProposal), audit: db.audit.filter(a => a.uid === u.id).slice(-100).map(a => { const { uid, ...rest } = a; return rest }) })
    }),
    'POST /api/integrations': wrap(async (req, res) => {
      session(req, true); const b = await body(req), u = session(req, true), db = read()
      const days = b.expiresInDays ?? 30
      if (!Number.isInteger(days) || days < 1 || days > 90) reject(400, 'expiry must be 1–90 days')
      if (b.allowProposals !== undefined && typeof b.allowProposals !== 'boolean') reject(400, 'invalid permission')
      if (db.tokens.filter(t => t.uid === u.id && valid(t)).length >= 10) reject(409, 'revoke an existing credential first')
      const token = 'ogi_' + crypto.randomBytes(32).toString('base64url')
      const t = { id: id(), uid: u.id, sv: u.sv || 0, digest: hash(token), name: String(b.name || 'Integration').slice(0, 80), scopes: b.allowProposals ? ['read', 'propose'] : ['read'], createdAt: now(), expiresAt: now() + days * DAY }
      db.tokens.push(t); audit(db, u.id, 'credential-created', t.id); save(db)
      json(res, 201, { token, credential: publicToken(t) }, { 'Cache-Control': 'no-store' })
    }),
    'POST /api/integrations/revoke': wrap(async (req, res) => {
      session(req, true); const b = await body(req), u = session(req, true), db = read(), t = db.tokens.find(t => t.uid === u.id && t.id === b.id)
      if (!t) reject(404, 'credential not found')
      t.revokedAt = now()
      db.proposals.filter(p => p.tokenId === t.id && p.status === 'pending').forEach(p => { p.status = 'revoked' })
      audit(db, u.id, 'credential-revoked', t.id); save(db); json(res, 200, { ok: true })
    }),
    'GET /api/integration/v1/context': wrap((req, res) => {
      const { db, t } = bearer(req, 'read'), current = stateStore.read(t.uid)
      audit(db, t.uid, 'context-read', t.id); save(db)
      json(res, 200, integrationContext(current.state || {}, current.revision, now()), { 'Cache-Control': 'no-store' })
    }),
    'POST /api/integration/v1/proposals': wrap(async (req, res) => {
      // Authenticate again after body I/O: revocation during upload must not be lost.
      bearer(req, 'propose'); const b = await body(req); const { db, t } = bearer(req, 'propose')
      const current = stateStore.read(t.uid)
      if (!current.state || !Number.isInteger(b.revision) || b.revision !== current.revision) reject(409, 'profile changed; read fresh context')
      if (!Array.isArray(b.changes) || !b.changes.length || b.changes.length > 25 || b.changes.some(c => !INTEGRATION_CHANGES.includes(c?.type))) reject(400, 'unsupported changes')
      if (new Set(b.changes.map(c => c.id)).size !== b.changes.length) reject(400, 'change IDs must be unique')
      const checked = validateReview(b, cleanPlan(current.state))
      if (!checked.ok || !checked.proposal) reject(400, 'proposal validation failed: ' + (checked.errors || []).join('; ').slice(0, 1200))
      applyIntegrationChanges(current.state, checked.proposal.changes)
      // Do not let an external client misrepresent the current prescription in the review.
      for (const c of checked.proposal.changes) {
        const routine = current.state.routines?.find(r => r.id === c.target.routineId)
        const exercise = routine?.ex?.find(e => e.id === c.target.exId)
        c.before = c.type === 'week' ? current.state.week?.[c.target.weekday] ?? null
          : c.type === 'routine-prog' ? routine.prog ?? null
          : c.type === 'rename-routine' ? routine.name
          : c.type === 'exercise-prog' ? exercise.prog ?? null
          : c.type === 'add-exercise' ? null
          : ['remove-exercise', 'swap-exercise', 'cardio'].includes(c.type) ? exercise
          : exercise?.[c.type] ?? null
      }
      if (db.proposals.some(p => p.uid === t.uid && p.status === 'pending' && p.expiresAt > now() && valid(db.tokens.find(x => x.id === p.tokenId)))) reject(409, 'review the existing proposal first')
      const p = { id: id(), uid: t.uid, tokenId: t.id, sourceName: t.name, revision: current.revision, summary: checked.proposal.summary, changes: checked.proposal.changes, status: 'pending', createdAt: now(), expiresAt: Math.min(t.expiresAt, now() + 7 * DAY) }
      db.proposals.push(p); db.proposals = db.proposals.filter(p => p.status === 'pending' || p.createdAt > now() - 90 * DAY).slice(-500)
      audit(db, t.uid, 'proposal-created', t.id, p.id); save(db)
      json(res, 201, { proposal: publicProposal(p) })
    }),
    'POST /api/integrations/proposals/reject': wrap(async (req, res) => {
      session(req, true); const b = await body(req), u = session(req, true), db = read(), p = proposalFor(db, u.id, b.id)
      p.status = 'rejected'; audit(db, u.id, 'proposal-rejected', p.tokenId, p.id); save(db); json(res, 200, { ok: true })
    }),
    'POST /api/integrations/proposals/approve': wrap(async (req, res) => {
      session(req, true); const b = await body(req), u = session(req, true), db = read(), p = proposalFor(db, u.id, b.id), current = stateStore.read(u.id)
      if (b.revision !== p.revision || current.revision !== p.revision) reject(409, 'profile changed; reject this proposal and request a fresh review')
      if (current.state?.active) reject(409, 'finish or save the active workout first')
      const checked = validateReview(p, cleanPlan(current.state))
      if (!checked.ok || !checked.proposal) reject(400, 'proposal no longer valid')
      const next = applyIntegrationChanges(current.state, checked.proposal.changes)
      next._ts = now()
      // createStateStore.write takes a recoverable snapshot and checks the revision.
      const result = stateStore.write(u.id, next, current.revision)
      p.status = 'approved'; audit(db, u.id, 'proposal-approved', p.tokenId, p.id); save(db)
      json(res, 200, { ok: true, revision: result.revision, state: result.state })
    })
  }
}
