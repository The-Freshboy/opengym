import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { integrationRoutes, integrationContext, validateIntegrationReview, applyIntegrationChanges } from '../integrations.js'
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
  const retry = await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 })
  assert.equal(retry.status, 200); assert.equal(retry.body.alreadyApplied, true)
  assert.equal(s.store.read('alice').revision, 2, 'retry never applies twice')
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

test('sensitive new context requires explicit category consent and preserves warmups', () => {
  const state = { routines: [{ id: 'r', ex: [{ id: 'custom_a', note: 'EP instruction' }] }], customEx: [{ id: 'custom_a', n: 'Supported hold' }], goals: [{ id: 'goal', notBefore: '2026-09-10', targetShuttle: 5 }], readiness: { '2026-08-30': { pain: true } }, workouts: [{ d: '2026-08-30', sessionRpe: 4, feedback: { tingling: true }, entries: [{ hangContext: { support: 'feet' }, sets: [{ type: 'warmup' }] }] }] }
  const at = Date.parse('2026-08-30T10:00:00Z')
  const basic = integrationContext(state, 1, at)
  assert.equal(basic.goals, undefined); assert.equal(basic.readiness, undefined)
  assert.equal(basic.workouts[0].feedback.tingling, undefined)
  assert.equal(basic.workouts[0].entries[0].hangContext, undefined)
  assert.equal(basic.workouts[0].entries[0].sets[0].type, 'warmup')
  const full = integrationContext(state, 1, at, ['goals', 'readiness', 'instructions'])
  assert.equal(full.goals[0].notBefore, '2026-09-10')
  assert.equal(full.goals[0].targetShuttle, 5)
  assert.equal(full.workouts[0].feedback.tingling, true)
  assert.equal(full.workouts[0].entries[0].hangContext.support, 'feet')
  assert.equal(full.plan.routines[0].ex[0].note, 'EP instruction')
})

test('dated and custom proposals remain advisory, optional and progression-off', async t => {
  const s = setup(t), key = await s.mint(true)
  const changes = [
    { id: 'custom', type: 'add-custom-exercise', target: { routineId: 'r1' }, after: { exercise: { id: 'custom_supported', n: 'Feet-supported hold' }, prescription: { mode: 'time', sets: 2, sec: 5, prog: 'linear', note: 'Keep weight on feet' } } },
    { id: 'date', type: 'day-plan', target: { date: '2026-09-07' }, after: ['r1'] }
  ]
  const p = await s.call('POST /api/integration/v1/proposals', { revision: 1, summary: 'Familiarisation', changes }, { token: key.token })
  assert.equal(p.status, 201)
  assert.equal(s.store.read('alice').state.routines[0].ex.length, 1)
  const result = await s.call('POST /api/integrations/proposals/approve', { id: p.body.proposal.id, revision: 1 })
  assert.equal(result.status, 200)
  assert.equal(result.body.state.routines[0].ex[1].prog, 'off')
  assert.equal(result.body.state.routines[0].ex[1].optional, true)
  assert.equal(result.body.state.routines[0].ex[0].mandatory, true)
  assert.deepEqual(result.body.state.dayPlan, { '2026-09-07': ['r1'] })
  assert.equal(result.body.state.workouts[0].id, 'history')
})

test('dated proposals reject invalid dates and unknown routines; null and empty differ', () => {
  const state = { routines: [{ id: 'r1', ex: [] }], dayPlan: { '2026-09-07': ['r1'] } }
  const change = { id: 'd', type: 'day-plan', target: { date: '2026-02-30' }, after: ['r1'] }
  assert.throws(() => validateIntegrationReview({ changes: [change] }, state), /valid date/)
  change.target.date = '2026-09-07'; change.after = ['missing']
  assert.throws(() => validateIntegrationReview({ changes: [change] }, state), /existing routine/)
  change.after = []
  assert.deepEqual(applyIntegrationChanges(state, [change]).dayPlan['2026-09-07'], [])
  change.after = null
  assert.equal(applyIntegrationChanges(state, [change]).dayPlan['2026-09-07'], undefined)
})

test('approval recovers an audit-file gap using the committed operation marker', async t => {
  const s = setup(t), key = await s.mint(true)
  const p = (await s.call('POST /api/integration/v1/proposals', s.proposal, { token: key.token })).body.proposal
  const current = s.store.read('alice')
  const next = applyIntegrationChanges(current.state, p.changes)
  s.store.write('alice', next, current.revision, { operationId: p.id })
  const result = await s.call('POST /api/integrations/proposals/approve', { id: p.id, revision: 1 })
  assert.equal(result.body.alreadyApplied, true)
  assert.equal(result.body.revision, 2)
  const listing = await s.call('GET /api/integrations')
  assert.equal(listing.body.pending.length, 0)
  assert.equal(listing.body.audit.at(-1).action, 'proposal-approved-recovered')
})

test('credential category consent defaults closed, is disclosed and validated', async t => {
  const s = setup(t)
  const defaultKey = await s.mint(false)
  assert.deepEqual(defaultKey.credential.categories, [])
  const result = await s.call('POST /api/integrations', { categories: ['goals', 'instructions'] })
  assert.deepEqual(result.body.credential.categories, ['goals', 'instructions'])
  assert.equal((await s.call('POST /api/integrations', { categories: ['credentials'] })).status, 400)
  const listing = await s.call('GET /api/integrations')
  assert.equal(listing.body.audit.at(-1).tokenName, 'Integration')
})

test('dated custom exercise clones only the requested day and preserves other sessions', () => {
  const state = { routines: [{ id: 'base', name: 'Base', ex: [{ id: 'core', mandatory: true, sets: 2 }] }, { id: 'cardio', ex: [] }], customEx: [], week: { 1: ['base', 'cardio'] }, dayPlan: { '2026-08-31': ['base'], '2026-09-14': ['base', 'cardio'] }, workouts: [{ id: 'past' }] }
  const input = { changes: [{ id: 'hold', type: 'add-custom-exercise', target: { routineId: 'base', date: '2026-09-07' }, why: 'Optional feet-supported practice', after: { exercise: { id: 'custom_hold', n: 'Supported hold' }, prescription: { mode: 'time', sets: 2, sec: 5 } } }] }
  const review = validateIntegrationReview(input, state)
  assert.equal(review.proposal.changes[0].affectedDate, '2026-09-07')
  const next = applyIntegrationChanges(state, review.proposal.changes)
  assert.deepEqual(next.routines.find(r => r.id === 'base'), state.routines[0])
  assert.deepEqual(next.week, state.week)
  assert.deepEqual(next.dayPlan['2026-08-31'], ['base'])
  assert.deepEqual(next.dayPlan['2026-09-14'], ['base', 'cardio'])
  const copiedId = next.dayPlan['2026-09-07'][0]
  assert.notEqual(copiedId, 'base')
  assert.equal(next.dayPlan['2026-09-07'][1], 'cardio')
  const copied = next.routines.find(r => r.id === copiedId)
  assert.equal(copied.ex[0].mandatory, true)
  assert.equal(copied.ex[1].prog, 'off')
  assert.equal(copied.ex[1].optional, true)
  assert.deepEqual(next.workouts, state.workouts)
  assert.equal(applyIntegrationChanges(state, review.proposal.changes).dayPlan['2026-09-07'][0], copiedId, 'copy ID is deterministic')
  input.changes[0].target.date = '2026-09-08'
  assert.throws(() => validateIntegrationReview(input, state), /already containing/)
})
