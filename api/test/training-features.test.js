import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { emptyDatabase, loadDatabase } from '../database.js'
import { stateInputError } from '../request-guards.js'
import {
  COACHING_SCOPES, normaliseCoachScopes, sanitiseCoachingChanges, SET_TYPES,
  MAX_PROGRESS_PHOTO_BYTES, trainingFeatureRoutes, cleanupTrainingFeatures
} from '../training-features.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-training-features-'))
const response = () => ({
  status: null, body: null, headers: null, raw: null,
  writeHead(status, headers) { this.status = status; this.headers = headers },
  end(value) { this.raw = value }
})
const json = (res, status, body) => { res.status = status; res.body = body }
const call = async (routes, key, { user, body = {}, url } = {}) => {
  const res = response()
  await routes[key]({ user, body, url: url || key.split(' ')[1] }, res)
  return res
}

function fixture() {
  const dataDir = tmp()
  const coach = { id: 'coach-1', name: 'Coach' }
  const client = { id: 'client-1', name: 'Client' }
  const db = emptyDatabase(); db.users.push(coach, client)
  const states = new Map([[client.id, {
    routines: [{ id: 'r1', name: 'Upper', ex: [] }], week: { 1: ['r1'] }, dayPlan: {},
    workouts: [{ id: 'w1', d: '2026-09-01' }], readiness: { '2026-09-01': { energy: 4 } },
    bodyweight: [{ d: '2026-09-01', w: 80 }], measurements: [{ d: '2026-09-01', waist: 82 }]
  }]])
  let saves = 0
  const pushes = []
  const routes = trainingFeatureRoutes({
    json,
    readBody: async req => req.body || {},
    readSession: req => req.user || null,
    users: () => db.users,
    db,
    saveDb: () => { saves++ },
    stateStore: { read: id => ({ state: states.get(id) || null, revision: 1 }) },
    dataDir,
    sendPush: async (id, payload) => { pushes.push({ id, payload }) },
    audit: () => {}
  })
  return { dataDir, coach, client, db, states, routes, pushes, saves: () => saves }
}

test('coaching scopes are allow-listed and de-duplicated', () => {
  assert.deepEqual(normaliseCoachScopes(['plans', 'workouts', 'plans', 'photos', 'admin']), ['plans', 'workouts'])
  assert.deepEqual(normaliseCoachScopes(), COACHING_SCOPES)
})

test('proposal changes reject oversized payloads', () => {
  assert.deepEqual(sanitiseCoachingChanges([{ op: 'replace', path: '/week/1', value: 'abc' }]), [{ op: 'replace', path: '/week/1', value: 'abc' }])
  assert.throws(() => sanitiseCoachingChanges([{ x: 'x'.repeat(30 * 1024) }]), /too large/)
})

test('feature contract exposes supported set tags and photo ceiling', () => {
  assert.deepEqual(SET_TYPES, ['warmup', 'working', 'amrap', 'drop', 'failure', 'backoff'])
  assert.equal(MAX_PROGRESS_PHOTO_BYTES, 3 * 1024 * 1024)
})

test('legacy databases gain backend feature containers without losing existing data', () => {
  const file = path.join(tmp(), 'db.json')
  fs.writeFileSync(file, JSON.stringify({ users: [], creds: [], custom: { keep: true } }))
  const db = loadDatabase(file)
  assert.deepEqual(db.coachLinks, [])
  assert.deepEqual(db.coachItems, [])
  assert.deepEqual(db.progressPhotos, {})
  assert.deepEqual(db.custom, { keep: true })
})

test('state validation accepts and bounds new user-owned training fields', () => {
  assert.equal(stateInputError({
    routines: [], workouts: [], measurements: [], substitutionHistory: [], sessionNotes: [],
    exerciseNotes: {}, exercisePreferences: {}, readiness: {}
  }), null)
  assert.match(stateInputError({ measurements: Array(5001).fill({}) }), /measurements/)
  assert.match(stateInputError({ exerciseNotes: Object.fromEntries(Array.from({ length: 20001 }, (_, i) => [i, 'x'])) }), /exerciseNotes/)
})

test('human coaching is explicit, scoped and proposal-only', async () => {
  const f = fixture()
  let res = await call(f.routes, 'POST /api/training/coaching/invite', {
    user: f.coach, body: { scopes: ['plans', 'workouts'], note: 'Strength block' }
  })
  assert.equal(res.status, 200)
  const code = res.body.invite.code

  res = await call(f.routes, 'POST /api/training/coaching/invite/preview', { user: f.client, body: { code } })
  assert.equal(res.status, 200)
  assert.equal(res.body.coach.name, 'Coach')
  assert.deepEqual(res.body.scopes, ['plans', 'workouts'])

  res = await call(f.routes, 'POST /api/training/coaching/accept', { user: f.client, body: { code } })
  assert.equal(res.status, 200)

  res = await call(f.routes, 'GET /api/training/coaching/client', { user: f.coach, url: '/api/training/coaching/client?id=client-1' })
  assert.equal(res.status, 200)
  assert.ok(res.body.plan)
  assert.ok(res.body.workouts)
  assert.equal(res.body.readiness, undefined)
  assert.equal(res.body.measurements, undefined)

  const before = JSON.stringify(f.states.get(f.client.id))
  res = await call(f.routes, 'POST /api/training/coaching/item', {
    user: f.coach,
    body: { clientId: f.client.id, type: 'proposal', title: 'Small plan change', text: 'Swap one movement.', changes: [{ kind: 'replace-exercise', from: 'a', to: 'b' }] }
  })
  assert.equal(res.status, 200)
  const proposalId = res.body.item.id
  assert.equal(f.pushes.length, 1)
  assert.equal(JSON.stringify(f.states.get(f.client.id)), before, 'coach proposal must not mutate client state')

  res = await call(f.routes, 'POST /api/training/coaching/decision', { user: f.client, body: { id: proposalId, decision: 'accepted' } })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.applyChanges, [{ kind: 'replace-exercise', from: 'a', to: 'b' }])
  assert.equal(JSON.stringify(f.states.get(f.client.id)), before, 'acceptance records approval but still does not silently mutate state')
})

test('coach cannot read unshared readiness or create plan proposals without plan scope', async () => {
  const f = fixture()
  let res = await call(f.routes, 'POST /api/training/coaching/invite', { user: f.coach, body: { scopes: ['workouts'] } })
  const code = res.body.invite.code
  await call(f.routes, 'POST /api/training/coaching/accept', { user: f.client, body: { code } })
  res = await call(f.routes, 'POST /api/training/coaching/item', {
    user: f.coach, body: { clientId: f.client.id, type: 'proposal', text: 'Change plan', changes: [{ kind: 'x' }] }
  })
  assert.equal(res.status, 403)
  res = await call(f.routes, 'GET /api/training/coaching/client', { user: f.coach, url: '/api/training/coaching/client?id=client-1' })
  assert.equal(res.body.readiness, undefined)
  assert.ok(res.body.workouts)
})

test('progress photos are private, type-checked and cleaned up', async () => {
  const f = fixture()
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  let res = await call(f.routes, 'POST /api/training/photos', {
    user: f.client, body: { mime: 'image/jpeg', base64: jpeg.toString('base64'), date: '2026-09-08', note: 'Front' }
  })
  assert.equal(res.status, 200)
  const id = res.body.photo.id
  assert.equal(f.db.progressPhotos[f.client.id].length, 1)
  assert.equal(fs.existsSync(path.join(f.dataDir, 'progress-photos', f.client.id, `${id}.jpg`)), true)

  res = await call(f.routes, 'POST /api/training/photos', {
    user: f.client, body: { mime: 'image/jpeg', base64: Buffer.from('not really a jpeg').toString('base64') }
  })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /does not match/)

  res = await call(f.routes, 'GET /api/training/photo', { user: f.client, url: `/api/training/photo?id=${id}` })
  assert.equal(res.status, 200)
  assert.equal(res.headers['Cache-Control'], 'private, no-store')
  assert.equal(Buffer.compare(res.raw, jpeg), 0)

  cleanupTrainingFeatures({ dataDir: f.dataDir, db: f.db }, f.client.id)
  assert.equal(fs.existsSync(path.join(f.dataDir, 'progress-photos', f.client.id)), false)
  assert.equal(f.db.progressPhotos[f.client.id], undefined)
})
