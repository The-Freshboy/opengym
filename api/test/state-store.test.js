import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStateStore, StateConflict } from '../state-store.js'

test('state revisions reject stale writes and preserve current data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-state-'))
  const store = createStateStore(dir)
  assert.deepEqual(store.read('u1'), { state: null, revision: 0, updatedAt: null })
  assert.equal(store.write('u1', { value: 1 }, 0).revision, 1)
  assert.throws(() => store.write('u1', { value: 2 }, 0), StateConflict)
  assert.deepEqual(store.read('u1').state, { value: 1 })
})

test('snapshots can restore a previous state as a new revision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-state-'))
  let instant = new Date('2026-08-29T01:00:00Z')
  const store = createStateStore(dir, { now: () => instant })
  store.write('u1', { value: 1 }, 0)
  instant = new Date('2026-08-29T02:00:00Z')
  store.write('u1', { value: 2 }, 1)
  const previous = store.list('u1').find(x => x.revision === 1)
  const restored = store.restore('u1', previous.id, 2)
  assert.equal(restored.revision, 3)
  assert.deepEqual(restored.state, { value: 1 })
})

test('snapshot preview is read-only, confined to the owner, and restore requires a revision', () => {
  const store = createStateStore(fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-state-')))
  store.write('one', { workouts: [] }, 0); store.backup('one')
  const snap = store.list('one')[0]
  assert.deepEqual(store.preview('one', snap.id).state, { workouts: [] })
  assert.equal(store.read('one').revision, 1)
  assert.throws(() => store.preview('two', snap.id), /not found/)
  assert.throws(() => store.preview('one', '../secret'), /invalid/)
  assert.throws(() => store.restore('one', snap.id), /revision required/)
})

test('daily backups are bounded and do not change state revision', () => {
  let now = new Date('2026-01-01T00:00:00Z')
  const store = createStateStore(fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-state-')), { dailyLimit: 3, now: () => now })
  store.write('one', { workouts: [] }, 0)
  for (let n = 1; n <= 10; n++) { now = new Date(`2026-01-${String(n).padStart(2, '0')}T00:00:00Z`); store.backup('one'); store.backup('one') }
  assert.equal(store.list('one').length, 3)
  assert.equal(store.read('one').revision, 1)
})

test('redo journal repairs a crash between state and revision writes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-journal-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const store = createStateStore(dir)
  store.write('one', { value: 1 }, 0)
  fs.writeFileSync(path.join(dir, 'state-one.pending.json'), JSON.stringify({ state: { value: 2 }, revision: 2, updatedAt: '2026-08-30T00:00:00Z' }))
  const recovered = createStateStore(dir).read('one')
  assert.equal(recovered.revision, 2); assert.equal(recovered.state.value, 2)
  assert.equal(fs.existsSync(path.join(dir, 'state-one.pending.json')), false)
})

test('corrupt state fails closed instead of becoming an empty account', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-corrupt-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'state-one.json'), '{broken')
  const store = createStateStore(dir)
  assert.throws(() => store.read('one'), /unreadable/)
  assert.throws(() => store.write('one', {}, 0), /unreadable/)
})

test('snapshot checksum detects accidental modification without changing current state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-checksum-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const store = createStateStore(dir)
  store.write('one', { value: 1 }, 0); store.backup('one')
  const snapshot = store.list('one')[0]
  const file = path.join(dir, 'snapshots', 'one', snapshot.id + '.json')
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')); saved.state.value = 999
  fs.writeFileSync(file, JSON.stringify(saved))
  assert.throws(() => store.preview('one', snapshot.id), /integrity/)
  assert.equal(store.read('one').state.value, 1)
})
