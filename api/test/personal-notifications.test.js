import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canberraWeek, createPersonalNotifier } from '../personal-notifications.js'

test('weekly reminder follows Canberra standard time and daylight saving', () => {
  assert.equal(canberraWeek(new Date('2026-08-30T08:59:00Z')).due, false)
  assert.equal(canberraWeek(new Date('2026-08-30T09:00:00Z')).due, true)
  assert.equal(canberraWeek(new Date('2026-10-04T07:59:00Z')).due, false)
  assert.equal(canberraWeek(new Date('2026-10-04T08:00:00Z')).due, true)
  assert.equal(canberraWeek(new Date('2026-08-31T09:00:00Z')).due, false)
})
const fixture = (over = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-notify-'))
  fs.writeFileSync(path.join(dir, 'topic'), 'test-topic'); fs.writeFileSync(path.join(dir, 'token'), 'test-token')
  const calls = [], options = { dataDir: dir, users: () => [{ id: 'u' }], readState: () => ({ personal: { weeklySummary: true }, note: 'private health data' }), env: { NTFY_URL: 'https://ntfy.example', NTFY_TOPIC_FILE: path.join(dir, 'topic'), NTFY_TOKEN_FILE: path.join(dir, 'token') }, now: () => new Date('2026-08-30T09:00:00Z'), fetcher: async (url, request) => { calls.push({ url, request }); return { ok: true } }, ...over }
  return { calls, notifier: createPersonalNotifier(options), options }
}
test('notification is private, authenticated and deduplicated across restarts', async () => {
  const { notifier, calls, options } = fixture()
  assert.equal((await notifier.tick()).sent, 1)
  assert.equal((await notifier.tick()).sent, 0)
  assert.equal((await createPersonalNotifier(options).tick()).sent, 0)
  assert.equal(calls[0].request.headers.Authorization, 'Bearer test-token')
  assert.ok(!JSON.stringify(calls).includes('private health data'))
  assert.equal(calls.length, 1)
})
test('opt-out and multiple profiles fail closed', async () => {
  assert.equal((await fixture({ readState: () => ({}) }).notifier.tick()).sent, 0)
  assert.equal((await fixture({ users: () => [{ id: 'u' }, { id: 'v' }] }).notifier.tick()).sent, 0)
})
test('a failed send is retried, not marked delivered', async () => {
  let tries = 0
  const { notifier } = fixture({ fetcher: async () => ({ ok: ++tries > 1, status: 500 }) })
  await assert.rejects(notifier.tick(), /HTTP 500/)
  assert.equal((await notifier.tick()).sent, 1)
})
test('missing notification configuration never sends anything', async () => { assert.equal((await fixture({ env: {} }).notifier.tick()).sent, 0) })
