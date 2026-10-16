import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DAY = 86400000
const TYPES = Object.freeze(['exercise', 'heart_rate', 'resting_heart_rate', 'hrv', 'sleep', 'steps', 'distance', 'active_calories', 'weight'])
const TYPE_SET = new Set(TYPES)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const id = () => crypto.randomBytes(16).toString('hex')
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '')
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null

class HealthConnectError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const reject = (status, message) => { throw new HealthConnectError(status, message) }

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

function empty() {
  return { version: 1, credentials: [], consent: { shareWithCoach: false }, records: [], imports: [] }
}

export function createHealthConnectStore(dataDir) {
  const dir = path.join(dataDir, 'health-connect')
  const file = uid => path.join(dir, safe(uid) + '.json')
  const read = uid => {
    try { return { ...empty(), ...JSON.parse(fs.readFileSync(file(uid), 'utf8')) } }
    catch (error) { if (error.code === 'ENOENT') return empty(); throw error }
  }
  const write = (uid, value) => atomicWrite(file(uid), value)
  return { read, write }
}

function cleanRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject(400, 'invalid health record')
  const type = String(input.type || '')
  if (!TYPE_SET.has(type)) reject(400, 'unsupported health record type')
  const sourceRecordId = String(input.sourceRecordId || '').trim()
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(sourceRecordId)) reject(400, 'invalid source record id')
  const startTime = new Date(input.startTime).toISOString()
  const endTime = new Date(input.endTime || input.startTime).toISOString()
  if (endTime < startTime) reject(400, 'health record ends before it starts')
  const source = String(input.source || '').trim().slice(0, 120)
  const out = { type, sourceRecordId, startTime, endTime, ...(source ? { source } : {}) }
  if (type === 'exercise') {
    out.exerciseType = String(input.exerciseType || 'other').slice(0, 80)
    out.title = String(input.title || '').trim().slice(0, 120) || null
  } else if (type === 'sleep') {
    out.minutes = finite(input.minutes)
    if (out.minutes == null || out.minutes < 0 || out.minutes > 1440) reject(400, 'invalid sleep duration')
  } else {
    out.value = finite(input.value)
    if (out.value == null || out.value < 0) reject(400, 'invalid health value')
    if (type === 'heart_rate' && out.value > 300 || type === 'resting_heart_rate' && out.value > 300 || type === 'hrv' && out.value > 1000 || type === 'weight' && out.value > 1000) reject(400, 'health value out of range')
  }
  return out
}

function publicCredential(value) {
  const { digest, ...rest } = value
  return rest
}

function summaries(records, now = Date.now()) {
  const recent = records.filter(r => Date.parse(r.endTime) >= now - 28 * DAY)
  const byDay = new Map()
  for (const row of recent) {
    const date = row.startTime.slice(0, 10)
    const day = byDay.get(date) || { date, steps: 0, distanceKm: 0, activeCalories: 0, exerciseMinutes: 0, sleepMinutes: null, restingHeartRate: null, hrvMs: null, weightKg: null }
    if (row.type === 'steps') day.steps += row.value
    if (row.type === 'distance') day.distanceKm += row.value
    if (row.type === 'active_calories') day.activeCalories += row.value
    if (row.type === 'exercise') day.exerciseMinutes += Math.max(0, (Date.parse(row.endTime) - Date.parse(row.startTime)) / 60000)
    if (row.type === 'sleep') day.sleepMinutes = (day.sleepMinutes || 0) + row.minutes
    if (row.type === 'resting_heart_rate') day.restingHeartRate = row.value
    if (row.type === 'hrv') day.hrvMs = row.value
    if (row.type === 'weight') day.weightKg = row.value
    byDay.set(date, day)
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => Object.fromEntries(Object.entries(day).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v])))
}

export function healthConnectRoutes({ json, readBody, readSession, users, dataDir, origin, now = Date.now }) {
  const store = createHealthConnectStore(dataDir)
  const respond = json
  json = (res, status, value, headers = {}) => respond(res, status, value, { 'Cache-Control': 'no-store', ...headers })
  const limits = new Map()
  const limit = (key, max) => {
    const at = now(), current = limits.get(key), bucket = !current || at - current.at >= 60000 ? { at, count: 0 } : current
    if (++bucket.count > max) reject(429, 'too many requests; retry later')
    limits.set(key, bucket)
  }
  const session = (req, mutate = false) => {
    if (req.headers.authorization) reject(401, 'use a signed-in browser to manage Health Connect')
    const user = readSession(req)
    if (!user || user.disabled) reject(401, 'not signed in')
    if (mutate && req.headers.origin !== origin) reject(403, 'same-origin browser request required')
    limit('user:' + user.id, 60)
    return user
  }
  const bearer = req => {
    limit('ip:' + (req.socket?.remoteAddress || 'unknown'), 120)
    const raw = String(req.headers.authorization || '')
    if (!/^Bearer ogh_[A-Za-z0-9_-]{43}$/.test(raw)) reject(401, 'invalid Health Connect credential')
    const digest = hash(raw.slice(7))
    for (const user of users()) {
      const data = store.read(user.id)
      const credential = data.credentials.find(c => c.digest?.length === digest.length && crypto.timingSafeEqual(Buffer.from(c.digest), Buffer.from(digest)))
      if (!credential) continue
      if (user.disabled || credential.revokedAt || credential.expiresAt <= now() || credential.sv !== (user.sv || 0)) reject(401, 'invalid Health Connect credential')
      limit('credential:' + credential.id, 30)
      credential.lastUsedAt = now()
      store.write(user.id, data)
      return { user, data, credential }
    }
    reject(401, 'invalid Health Connect credential')
  }
  const body = async (req, max = 512 * 1024) => {
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') reject(415, 'JSON required')
    const value = await readBody(req)
    if (!value || Array.isArray(value) || typeof value !== 'object' || JSON.stringify(value).length > max) reject(400, 'invalid or oversized request')
    return value
  }
  const wrap = fn => async (req, res) => {
    try { await fn(req, res) }
    catch (error) { if (error instanceof HealthConnectError) return json(res, error.status, { error: error.message }); throw error }
  }
  const status = data => ({
    consent: data.consent || { shareWithCoach: false },
    credentials: data.credentials.map(publicCredential),
    recordCount: data.records.length,
    lastImport: data.imports.at(-1) || null,
    availableTypes: TYPES,
    daily: summaries(data.records, now())
  })
  return {
    'GET /api/health-connect': wrap((req, res) => { const user = session(req); json(res, 200, status(store.read(user.id))) }),
    'POST /api/health-connect/credentials': wrap(async (req, res) => {
      const user = session(req, true), input = await body(req, 8192), data = store.read(user.id)
      const days = input.expiresInDays ?? 90
      if (!Number.isInteger(days) || days < 1 || days > 365) reject(400, 'expiry must be 1–365 days')
      if (data.credentials.filter(c => !c.revokedAt && c.expiresAt > now()).length >= 5) reject(409, 'revoke an existing mobile credential first')
      const token = 'ogh_' + crypto.randomBytes(32).toString('base64url')
      const credential = { id: id(), digest: hash(token), name: String(input.name || 'Android phone').trim().slice(0, 80), sv: user.sv || 0, scopes: ['health:write'], createdAt: now(), expiresAt: now() + days * DAY }
      data.credentials.push(credential); store.write(user.id, data)
      json(res, 201, { token, credential: publicCredential(credential) })
    }),
    'POST /api/health-connect/revoke': wrap(async (req, res) => {
      const user = session(req, true), input = await body(req, 8192), data = store.read(user.id), credential = data.credentials.find(c => c.id === input.id)
      if (!credential) reject(404, 'credential not found')
      credential.revokedAt = now(); store.write(user.id, data); json(res, 200, { ok: true })
    }),
    'POST /api/health-connect/consent': wrap(async (req, res) => {
      const user = session(req, true), input = await body(req, 8192)
      if (typeof input.shareWithCoach !== 'boolean') reject(400, 'invalid consent setting')
      const data = store.read(user.id)
      data.consent = { shareWithCoach: input.shareWithCoach, updatedAt: new Date(now()).toISOString() }
      store.write(user.id, data); json(res, 200, { consent: data.consent })
    }),
    'GET /api/health-connect/v1/status': wrap((req, res) => { const { data } = bearer(req); json(res, 200, { recordCount: data.records.length, lastImport: data.imports.at(-1) || null }) }),
    'POST /api/health-connect/v1/import': wrap(async (req, res) => {
      bearer(req)
      const input = await body(req)
      if (!Array.isArray(input.records) || input.records.length > 250) reject(400, 'records must contain at most 250 items')
      const { user, data, credential } = bearer(req)
      const incoming = input.records.map(cleanRecord)
      const existing = new Map(data.records.map(r => [`${r.type}:${r.sourceRecordId}`, r]))
      let inserted = 0, updated = 0
      for (const record of incoming) {
        const key = `${record.type}:${record.sourceRecordId}`
        if (existing.has(key)) updated++; else inserted++
        existing.set(key, record)
      }
      data.records = [...existing.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(-20000)
      const receipt = { id: id(), at: new Date(now()).toISOString(), credentialId: credential.id, received: incoming.length, inserted, updated }
      data.imports = [...data.imports, receipt].slice(-100)
      store.write(user.id, data)
      json(res, 200, { ok: true, receipt, recordCount: data.records.length })
    })
  }
}

export function healthCoachSummary(dataDir, uid, now = Date.now()) {
  const data = createHealthConnectStore(dataDir).read(uid)
  if (!data.consent?.shareWithCoach) return null
  return { source: 'Health Connect (user consented)', excludes: ['GPS routes'], days: summaries(data.records, now).slice(-14) }
}

export { TYPES as HEALTH_CONNECT_TYPES }
