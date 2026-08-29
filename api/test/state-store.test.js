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
