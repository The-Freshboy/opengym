import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHealthConnectStore, healthCoachSummary, healthConnectRoutes } from '../health-connect.js'

const dataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'health-connect-test-'))
const response = () => ({ headersSent: false, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(value) { this.value = value } })
const json = (res, status, value, headers = {}) => { res.status = status; res.body = value; res.headers = headers }
const request = (body = {}, over = {}) => ({ body, headers: { origin: 'https://gym.example', 'content-type': 'application/json', ...(over.headers || {}) }, socket: { remoteAddress: '127.0.0.1' }, ...over })

test('mobile credential is stored hashed and imports deduplicate per user', async () => {
  const dir = dataDir(), user = { id: 'u1', sv: 0 }, now = Date.parse('2026-10-17T00:00:00Z')
  const routes = healthConnectRoutes({ json, readBody: async req => req.body, readSession: () => user, users: () => [user], dataDir: dir, origin: 'https://gym.example', now: () => now })
  const created = response()
  await routes['POST /api/health-connect/credentials'](request({ name: 'Phone', expiresInDays: 30 }), created)
  assert.equal(created.status, 201)
  assert.match(created.body.token, /^ogh_/)
  const stored = createHealthConnectStore(dir).read(user.id)
  assert.equal(stored.credentials[0].token, undefined)
  assert.notEqual(stored.credentials[0].digest, created.body.token)

  const auth = { authorization: `Bearer ${created.body.token}`, 'content-type': 'application/json' }
  const records = [{ type: 'steps', sourceRecordId: 'garmin:1', startTime: '2026-10-16T00:00:00Z', endTime: '2026-10-16T23:59:00Z', value: 8000, source: 'com.garmin.android.apps.connectmobile' }]
  const first = response(), second = response()
  await routes['POST /api/health-connect/v1/import'](request({ records }, { headers: auth }), first)
  await routes['POST /api/health-connect/v1/import'](request({ records: [{ ...records[0], value: 8100 }] }, { headers: auth }), second)
  assert.deepEqual([first.body.receipt.inserted, first.body.receipt.updated], [1, 0])
  assert.deepEqual([second.body.receipt.inserted, second.body.receipt.updated], [0, 1])
  assert.equal(createHealthConnectStore(dir).read(user.id).records[0].value, 8100)
})

test('coach summary is absent until explicit consent and never contains record ids', () => {
  const dir = dataDir(), store = createHealthConnectStore(dir)
  store.write('u1', { version: 1, credentials: [], consent: { shareWithCoach: false }, imports: [], records: [{ type: 'sleep', sourceRecordId: 'private-id', startTime: '2026-10-16T22:00:00Z', endTime: '2026-10-17T06:00:00Z', minutes: 480 }] })
  assert.equal(healthCoachSummary(dir, 'u1', Date.parse('2026-10-17T12:00:00Z')), null)
  const data = store.read('u1'); data.consent.shareWithCoach = true; store.write('u1', data)
  const summary = healthCoachSummary(dir, 'u1', Date.parse('2026-10-17T12:00:00Z'))
  assert.equal(summary.days[0].sleepMinutes, 480)
  assert.equal(JSON.stringify(summary).includes('private-id'), false)
  assert.deepEqual(summary.excludes, ['GPS routes'])
})

test('rejects unsupported record types and oversized batches', async () => {
  const dir = dataDir(), user = { id: 'u1', sv: 0 }, now = Date.now()
  const routes = healthConnectRoutes({ json, readBody: async req => req.body, readSession: () => user, users: () => [user], dataDir: dir, origin: 'https://gym.example', now: () => now })
  const made = response(); await routes['POST /api/health-connect/credentials'](request({}), made)
  const headers = { authorization: `Bearer ${made.body.token}`, 'content-type': 'application/json' }
  const bad = response(); await routes['POST /api/health-connect/v1/import'](request({ records: [{ type: 'route', sourceRecordId: '1', startTime: new Date().toISOString(), value: 1 }] }, { headers }), bad)
  assert.equal(bad.status, 400)
  const huge = response(); await routes['POST /api/health-connect/v1/import'](request({ records: Array.from({ length: 251 }, () => ({})) }, { headers }), huge)
  assert.equal(huge.status, 400)
})
