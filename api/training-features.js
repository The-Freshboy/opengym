import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const SET_TYPES = Object.freeze(['warmup', 'working', 'amrap', 'drop', 'failure', 'backoff'])
export const MEASUREMENT_FIELDS = Object.freeze(['weight', 'waist', 'chest', 'armLeft', 'armRight', 'hips', 'thighLeft', 'thighRight', 'bodyFat'])
export const COACHING_SCOPES = Object.freeze(['plans', 'workouts', 'readiness', 'measurements'])
export const TRAINING_FEATURES = Object.freeze({
  exerciseSubstitutions: true,
  warmupSets: true,
  plateCalculator: true,
  setTypes: true,
  persistentNotes: true,
  multipleSessionsPerDay: true,
  readiness: true,
  humanCoach: true,
  coachContextChat: true,
  bodyMeasurements: true,
  progressPhotos: true,
  trainingMaxProgramming: true
})

const PHOTO_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])
export const MAX_PROGRESS_PHOTO_BYTES = 3 * 1024 * 1024
const MAX_COACH_ITEMS = 5000
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

const isoNow = () => new Date().toISOString()
const uid = () => crypto.randomBytes(12).toString('base64url')
const text = (value, max) => String(value ?? '').trim().slice(0, max)
const cleanId = value => text(value, 180).replace(/[^a-zA-Z0-9_.:-]/g, '')

export function normaliseCoachScopes(input) {
  const requested = Array.isArray(input) ? input : COACHING_SCOPES
  return [...new Set(requested.filter(scope => COACHING_SCOPES.includes(scope)))]
}

export function sanitiseCoachingChanges(input) {
  if (!Array.isArray(input)) return []
  const changes = input.slice(0, 50).filter(change => change && typeof change === 'object' && !Array.isArray(change))
  if (Buffer.byteLength(JSON.stringify(changes), 'utf8') > 25 * 1024) throw new Error('proposal changes are too large')
  return changes
}

function ensureDb(db) {
  if (!Array.isArray(db.coachLinks)) db.coachLinks = []
  if (!Array.isArray(db.coachItems)) db.coachItems = []
  if (!db.progressPhotos || typeof db.progressPhotos !== 'object' || Array.isArray(db.progressPhotos)) db.progressPhotos = {}
}

function decodeBase64(input) {
  const raw = String(input || '').replace(/\s/g, '')
  if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) throw new Error('invalid base64 photo')
  const bytes = Buffer.from(raw, 'base64')
  if (!bytes.length || bytes.length > MAX_PROGRESS_PHOTO_BYTES) throw new Error('photo must be 3 MiB or smaller')
  return bytes
}

function matchesImageSignature(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

function isExpired(link) {
  return !link?.expiresAt || Date.parse(link.expiresAt) <= Date.now()
}

export function trainingFeatureRoutes({ json, readBody, readSession, users, db, saveDb, stateStore, dataDir, sendPush, audit }) {
  ensureDb(db)
  const allUsers = typeof users === 'function' ? users : () => db.users || []
  const findUser = id => allUsers().find(user => user.id === id)
  const auth = (req, res) => {
    const user = readSession(req)
    if (!user) json(res, 401, { error: 'not signed in' })
    return user
  }
  const activeLink = (coachId, clientId) => db.coachLinks.find(link => link.coachId === coachId && link.clientId === clientId && link.status === 'active')
  const photoDir = userId => path.join(dataDir, 'progress-photos', userId.replace(/[^a-zA-Z0-9_-]/g, ''))
  const photoMeta = userId => db.progressPhotos[userId] || (db.progressPhotos[userId] = [])

  return {
    'GET /api/training/features': async (req, res) => {
      const user = auth(req, res); if (!user) return
      const asCoach = db.coachLinks.filter(link => link.coachId === user.id && link.status === 'active').map(link => ({
        clientId: link.clientId,
        clientName: findUser(link.clientId)?.name || 'Unknown',
        scopes: link.scopes,
        acceptedAt: link.acceptedAt || null
      }))
      const asClient = db.coachLinks.filter(link => link.clientId === user.id && link.status === 'active').map(link => ({
        coachId: link.coachId,
        coachName: findUser(link.coachId)?.name || 'Coach',
        scopes: link.scopes,
        acceptedAt: link.acceptedAt || null
      }))
      json(res, 200, {
        version: 1,
        capabilities: TRAINING_FEATURES,
        setTypes: SET_TYPES,
        measurementFields: MEASUREMENT_FIELDS,
        coachingScopes: COACHING_SCOPES,
        progressPhotoMaxBytes: MAX_PROGRESS_PHOTO_BYTES,
        coaching: { asCoach, asClient }
      })
    },

    'POST /api/training/coaching/invite': async (req, res) => {
      const coach = auth(req, res); if (!coach) return
      const body = await readBody(req)
      const scopes = normaliseCoachScopes(body.scopes)
      if (!scopes.length) return json(res, 400, { error: 'at least one valid coaching scope is required' })
      let code
      do { code = crypto.randomBytes(8).toString('hex').toUpperCase() } while (db.coachLinks.some(link => link.code === code))
      const createdAt = isoNow()
      const link = {
        id: uid(), code, coachId: coach.id, clientId: null, status: 'pending', scopes,
        note: text(body.note, 160) || null,
        createdAt,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString()
      }
      db.coachLinks.push(link)
      audit?.(coach, 'coaching.invite.created', null, scopes.join(','))
      saveDb()
      json(res, 200, { invite: { code, scopes, note: link.note, createdAt, expiresAt: link.expiresAt } })
    },

    'POST /api/training/coaching/invite/preview': async (req, res) => {
      const client = auth(req, res); if (!client) return
      const body = await readBody(req)
      const code = text(body.code, 32).toUpperCase()
      const link = db.coachLinks.find(item => item.code === code && item.status === 'pending' && !item.clientId)
      if (!link || isExpired(link)) return json(res, 404, { error: 'invite not found or expired' })
      if (link.coachId === client.id) return json(res, 400, { error: 'cannot coach yourself' })
      const coach = findUser(link.coachId)
      json(res, 200, { coach: { id: link.coachId, name: coach?.name || 'Coach' }, scopes: link.scopes, note: link.note, expiresAt: link.expiresAt })
    },

    'POST /api/training/coaching/accept': async (req, res) => {
      const client = auth(req, res); if (!client) return
      const body = await readBody(req)
      const code = text(body.code, 32).toUpperCase()
      const link = db.coachLinks.find(item => item.code === code && item.status === 'pending' && !item.clientId)
      if (!link || isExpired(link)) return json(res, 404, { error: 'invite not found or expired' })
      if (link.coachId === client.id) return json(res, 400, { error: 'cannot coach yourself' })
      if (activeLink(link.coachId, client.id)) return json(res, 409, { error: 'coaching relationship already active' })
      link.clientId = client.id
      link.status = 'active'
      link.acceptedAt = isoNow()
      delete link.code
      audit?.(client, 'coaching.relationship.accepted', link.coachId, link.scopes.join(','))
      saveDb()
      const coach = findUser(link.coachId)
      json(res, 200, { ok: true, coach: { id: link.coachId, name: coach?.name || 'Coach' }, scopes: link.scopes })
    },

    'GET /api/training/coaching/clients': async (req, res) => {
      const coach = auth(req, res); if (!coach) return
      const clients = db.coachLinks.filter(link => link.coachId === coach.id && link.status === 'active').map(link => {
        const client = findUser(link.clientId)
        const state = stateStore.read(link.clientId).state || {}
        return {
          id: link.clientId,
          name: client?.name || 'Unknown',
          scopes: link.scopes,
          acceptedAt: link.acceptedAt || null,
          workouts: Array.isArray(state.workouts) ? state.workouts.length : 0,
          lastWorkout: Array.isArray(state.workouts) ? state.workouts.at(-1)?.d || null : null
        }
      })
      json(res, 200, { clients })
    },

    'GET /api/training/coaching/client': async (req, res) => {
      const coach = auth(req, res); if (!coach) return
      const clientId = cleanId(new URL(req.url, 'http://x').searchParams.get('id'))
      const link = activeLink(coach.id, clientId)
      if (!link) return json(res, 403, { error: 'no active coaching relationship' })
      const client = findUser(clientId)
      if (!client) return json(res, 404, { error: 'client not found' })
      const state = stateStore.read(clientId).state || {}
      const out = { client: { id: client.id, name: client.name }, scopes: link.scopes }
      if (link.scopes.includes('plans')) out.plan = { routines: state.routines || [], week: state.week || {}, dayPlan: state.dayPlan || {} }
      if (link.scopes.includes('workouts')) out.workouts = state.workouts || []
      if (link.scopes.includes('readiness')) out.readiness = state.readiness || {}
      if (link.scopes.includes('measurements')) out.measurements = { bodyweight: state.bodyweight || [], measurements: state.measurements || [] }
      out.items = db.coachItems.filter(item => item.coachId === coach.id && item.clientId === clientId)
      json(res, 200, out)
    },

    'POST /api/training/coaching/item': async (req, res) => {
      const coach = auth(req, res); if (!coach) return
      const body = await readBody(req)
      const clientId = cleanId(body.clientId)
      const link = activeLink(coach.id, clientId)
      if (!link) return json(res, 403, { error: 'no active coaching relationship' })
      const itemText = text(body.text, 4000)
      if (!itemText) return json(res, 400, { error: 'text required' })
      const type = body.type === 'proposal' ? 'proposal' : 'comment'
      if (type === 'proposal' && !link.scopes.includes('plans')) return json(res, 403, { error: 'client has not shared plan access' })
      if (body.workoutId && !link.scopes.includes('workouts')) return json(res, 403, { error: 'client has not shared workout access' })
      let changes = []
      try { changes = type === 'proposal' ? sanitiseCoachingChanges(body.changes) : [] }
      catch (error) { return json(res, 400, { error: error.message }) }
      const item = {
        id: uid(), coachId: coach.id, clientId, type,
        status: type === 'proposal' ? 'pending' : 'open',
        title: text(body.title, 120) || null,
        text: itemText,
        workoutId: cleanId(body.workoutId) || null,
        exerciseId: cleanId(body.exerciseId) || null,
        changes,
        createdAt: isoNow()
      }
      db.coachItems.push(item)
      if (db.coachItems.length > MAX_COACH_ITEMS) db.coachItems = db.coachItems.slice(-MAX_COACH_ITEMS)
      audit?.(coach, `coaching.${type}.created`, clientId, item.id)
      saveDb()
      await sendPush?.(clientId, {
        title: type === 'proposal' ? 'New PT proposal' : 'New PT comment',
        body: item.title || itemText.slice(0, 120),
        tag: 'human-coach', url: '#/personal'
      })
      json(res, 200, { ok: true, item })
    },

    'GET /api/training/coaching/items': async (req, res) => {
      const client = auth(req, res); if (!client) return
      const items = db.coachItems.filter(item => item.clientId === client.id).map(item => ({
        ...item,
        coachName: findUser(item.coachId)?.name || 'Coach'
      }))
      json(res, 200, { items })
    },

    'POST /api/training/coaching/decision': async (req, res) => {
      const client = auth(req, res); if (!client) return
      const body = await readBody(req)
      const item = db.coachItems.find(entry => entry.id === body.id && entry.clientId === client.id && entry.type === 'proposal')
      if (!item) return json(res, 404, { error: 'proposal not found' })
      if (item.status !== 'pending') return json(res, 409, { error: 'proposal already decided' })
      if (!['accepted', 'rejected'].includes(body.decision)) return json(res, 400, { error: 'decision must be accepted or rejected' })
      item.status = body.decision
      item.decidedAt = isoNow()
      audit?.(client, `coaching.proposal.${body.decision}`, item.coachId, item.id)
      saveDb()
      // The server records approval but deliberately does not mutate the programme. The client
      // applies these changes through the same revision-checked review path used elsewhere.
      json(res, 200, { ok: true, item, applyChanges: item.status === 'accepted' ? item.changes : [] })
    },

    'POST /api/training/coaching/revoke': async (req, res) => {
      const user = auth(req, res); if (!user) return
      const body = await readBody(req)
      const otherId = cleanId(body.userId)
      const link = db.coachLinks.find(entry => entry.status === 'active' && (
        (entry.coachId === user.id && entry.clientId === otherId) ||
        (entry.clientId === user.id && entry.coachId === otherId)
      ))
      if (!link) return json(res, 404, { error: 'active coaching relationship not found' })
      link.status = 'revoked'
      link.revokedAt = isoNow()
      link.revokedBy = user.id
      audit?.(user, 'coaching.relationship.revoked', otherId)
      saveDb()
      json(res, 200, { ok: true })
    },

    'GET /api/training/photos': async (req, res) => {
      const user = auth(req, res); if (!user) return
      json(res, 200, { photos: photoMeta(user.id).map(({ ext, ...photo }) => photo) })
    },

    'POST /api/training/photos': async (req, res) => {
      const user = auth(req, res); if (!user) return
      const body = await readBody(req)
      const mime = text(body.mime, 40).toLowerCase()
      const ext = PHOTO_TYPES.get(mime)
      if (!ext) return json(res, 400, { error: 'photo must be JPEG, PNG or WebP' })
      let bytes
      try { bytes = decodeBase64(body.base64) }
      catch (error) { return json(res, 400, { error: error.message }) }
      if (!matchesImageSignature(bytes, mime)) return json(res, 400, { error: 'photo content does not match its declared image type' })
      const photoId = uid()
      const dir = photoDir(user.id)
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      const filename = `${photoId}.${ext}`
      fs.writeFileSync(path.join(dir, filename), bytes, { mode: 0o600 })
      const photo = {
        id: photoId, ext, mime, bytes: bytes.length,
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : new Date().toISOString().slice(0, 10),
        note: text(body.note, 500) || null,
        createdAt: isoNow()
      }
      photoMeta(user.id).push(photo)
      audit?.(user, 'progress-photo.added', user.id, photoId)
      saveDb()
      const { ext: _ext, ...publicPhoto } = photo
      json(res, 200, { ok: true, photo: publicPhoto })
    },

    'GET /api/training/photo': async (req, res) => {
      const user = auth(req, res); if (!user) return
      const photoId = cleanId(new URL(req.url, 'http://x').searchParams.get('id'))
      const photo = photoMeta(user.id).find(item => item.id === photoId)
      if (!photo) return json(res, 404, { error: 'photo not found' })
      try {
        const bytes = fs.readFileSync(path.join(photoDir(user.id), `${photo.id}.${photo.ext}`))
        res.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
        res.end(bytes)
      } catch { json(res, 404, { error: 'photo file missing' }) }
    },

    'POST /api/training/photo/delete': async (req, res) => {
      const user = auth(req, res); if (!user) return
      const body = await readBody(req)
      const photoId = cleanId(body.id)
      const photos = photoMeta(user.id)
      const photo = photos.find(item => item.id === photoId)
      if (!photo) return json(res, 404, { error: 'photo not found' })
      try { fs.unlinkSync(path.join(photoDir(user.id), `${photo.id}.${photo.ext}`)) } catch (error) { if (error.code !== 'ENOENT') throw error }
      db.progressPhotos[user.id] = photos.filter(item => item.id !== photoId)
      audit?.(user, 'progress-photo.removed', user.id, photoId)
      saveDb()
      json(res, 200, { ok: true })
    }
  }
}

export function cleanupTrainingFeatures({ dataDir, db }, userId) {
  ensureDb(db)
  db.coachLinks = db.coachLinks.filter(link => link.coachId !== userId && link.clientId !== userId)
  db.coachItems = db.coachItems.filter(item => item.coachId !== userId && item.clientId !== userId)
  delete db.progressPhotos[userId]
  const safeUser = String(userId).replace(/[^a-zA-Z0-9_-]/g, '')
  try { fs.rmSync(path.join(dataDir, 'progress-photos', safeUser), { recursive: true, force: true }) } catch {}
  try { fs.rmSync(path.join(dataDir, 'coach-context', safeUser + '.json'), { force: true }) } catch {}
}
