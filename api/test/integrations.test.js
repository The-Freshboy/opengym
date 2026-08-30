import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { integrationRoutes, integrationContext } from '../integrations.js'
import { createStateStore } from '../state-store.js'

function setup(t, enabled = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-integration-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let time = Date.now()
  const users = [{ id: 'alice', sv: 0 }, { id: 'bob', sv: 0 }]
  const store = createStateStore(dir)
  const state = { routines: [{ id: 'r1', name: 'Base', ex: [{ id: 'custom', sets: 2, reps: 5, mandatory: true }] }], week: { 1: 'r1' }, dayPlan: {}, customEx: [], workouts: [{ id: 'history', d: '2026-08-30' }], privateSecret: 'never-share' }
  store.write('alice', state)
  const routes = integrationRoutes({ enabled, dataDir: dir, origin: 'https://gym.example', now: () => time,
    stateStore: store, users: () => users, readSession: req => users.find(u => u.id === req.user),
    readBody: async req => req.body, json: (res, status, body) => Object.assign(res, { status, body }) })
  const call = async (key, body = {}, { user = 'alice', token, origin = 'https://gym.example' } = {}) => {
    const res = {}, req = { user, body, headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, socket: { remoteAddress: 'local' } }
    await routes[key](req, res); return res
  }
  const mint = async allowProposals => (await call('POST /api/integrations', { allowProposals })).body
  const proposal = { revision: 1, summary: 'Adjust volume', changes: [{ id: 'c1', type: 'sets', target: { routineId: 'r1', exId: 'custom' }, before: 999, after: 3, why: 'User reviewed training log' }] }
  return { dir, store, users, call, mint, proposal, advance: days => { time += days * 86400000 } }
}
test('disabled by default and session routes refuse bearer credentials and foreign origins', async t => {
  const s = setup(t, false)
  assert.equal((await s.call('GET /api/integrations')).status, 503)
  const a = setup(t), credential = await a.mint(false)
  assert.equal((await a.call('GET /api/integrations', {}, { token: credential.token })).status, 401)
  assert.equal((await a.call('POST /api/integrations', {}, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await a.call('POST /api/integrations', {}, { user: null })).status, 401)
})
test('secrets stored hashed only; read-only cannot propose; cookies cannot read external context', async t => {
  const s = setup(t), key = await s.mint(false)
  assert.ok(key.token.startsWith('ogi_'))
  assert.ok(!fs.readFileSync(path.join(s.dir, 'integrations.json'), 'utf8').includes(key.token))
  assert.equal((await s.call('GET /api/integration/v1/context')).status, 401)
  assert.equal((await s.call('POST /api/integration/v1/proposals', s.proposal, { token: key.token })).status, 403)
  const context = await s.call('GET /api/integration/v1/context', {}, { token: key.token })
  assert.equal(context.status, 200)
  assert.ok(!JSON.stringify(context.body).includes('never-share'))
  assert.equal((await s.call('GET /api/integrations', {}, { user: 'bob' })).body.tokens.length, 0)
  assert.equal((await s.call('POST /api/integrations/revoke', { id: key.credential.id }, { user: 'bob' })).status, 404)
})
test('expiry, account disabling and sign-out-everywhere invalidate credentials', async t => {
  const s = setup(t), key = await s.mint(false)
  const read = () => s.call('GET /api/integration/v1/context', {}, { token: key.token })
  s.users[0].disabled = true; assert.equal((await read()).status, 401)
  s.users[0].disabled = false; s.users[0].sv++; assert.equal((await read()).status, 401)
  s.users[0].sv = 0; s.advance(31); assert.equal((await read()).status, 401)
})
test('proposal is advisory; approval is owner-only, backed up, history-preserving and cannot replay', async t => {
  const s = setup(t), key = await s.mint(true)
  const result = await s.call('POST /api/integration/v1/proposals', s.proposal, { token: key.token })
  assert.equal(result.status, 201)
  const p = result.body.proposal
  assert.equal(p.changes[0].before, 2)
  assert.equal(s.store.read('alice').state.routines[0].ex[0].sets, 2)
  assert.equal((await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 }, { token: key.token })).status, 401)
  assert.equal((await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 }, { user: 'bob' })).status, 404)
  const applied = await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 })
  assert.equal(applied.status, 200)
  assert.equal(applied.body.state.routines[0].ex[0].sets, 3)
  assert.equal(applied.body.state.workouts[0].id, 'history')
  assert.ok(s.store.list('alice').length)
  assert.equal((await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 })).status, 404)
})
test('stale, active-workout and revoked proposals cannot apply', async t => {
  for (const reason of ['stale', 'active', 'revoked']) {
    const s = setup(t), key = await s.mint(true)
    if (reason === 'active') { const current = s.store.read('alice'); current.state.active = { id: 'active' }; s.store.write('alice', current.state); s.proposal.revision = 2 }
    const p = (await s.call('POST /api/integration/v1/proposals', s.proposal, { token: key.token })).body.proposal
    if (reason === 'stale') s.store.write('alice', s.store.read('alice').state)
    if (reason === 'revoked') await s.call('POST /api/integrations/revoke', { id: key.credential.id })
    assert.notEqual((await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: p.revision })).status, 200)
  }
})
test('mandatory exercises and arbitrary mutation types are rejected', async t => {
  const s = setup(t), key = await s.mint(true)
  for (const type of ['remove-exercise', 'delete-user', 'weight']) {
    s.proposal.changes[0].type = type
    assert.equal((await s.call('POST /api/integration/v1/proposals', s.proposal, { token: key.token })).status, 400)
  }
})
