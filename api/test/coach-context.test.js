import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-context-'))
process.env.DATA_DIR = temp
const ctx = await import('../coach-context.js?' + Date.now())

test('travel context defaults to affecting adherence and is window-filtered', () => {
  const saved = ctx.addCoachContext('u1', { reason: 'travel', from: '2026-09-01', to: '2026-09-05', note: 'Away for work trip' })
  assert.equal(saved.affectsAdherence, true)
  assert.equal(ctx.contextForPayload('u1', { from: '2026-08-01', to: '2026-08-31' }).length, 0)
  const found = ctx.contextForPayload('u1', { from: '2026-09-01', to: '2026-09-30' })
  assert.equal(found.length, 1)
  assert.equal(found[0].reason, 'travel')
})

test('equipment context does not alter adherence unless explicitly requested', () => {
  const a = ctx.addCoachContext('u2', { reason: 'equipment', from: '2026-09-02', to: '2026-09-02' })
  const b = ctx.addCoachContext('u2', { reason: 'equipment', from: '2026-09-03', to: '2026-09-03', affectsAdherence: true })
  assert.equal(a.affectsAdherence, false)
  assert.equal(b.affectsAdherence, true)
})

test('chat history stores bounded user and assistant messages without duplicating assistant job rows', () => {
  ctx.recordCoachUserMessage('u3', { jobId: 'j1', message: 'I was travelling, so I deliberately missed those sessions.' })
  const first = ctx.recordCoachAssistantMessage('u3', { jobId: 'j1', text: 'That changes the adherence interpretation.', revised: true })
  const duplicate = ctx.recordCoachAssistantMessage('u3', { jobId: 'j1', text: 'duplicate' })
  assert.ok(first)
  assert.equal(duplicate, null)
  const conv = ctx.conversationForPayload('u3')
  assert.deepEqual(conv.map(x => x.role), ['user', 'assistant'])
})

test('invalid or overlong context ranges are rejected and deletion/forget work', () => {
  assert.throws(() => ctx.addCoachContext('u4', { reason: 'travel', from: 'bad', to: '2026-09-05' }), /valid/)
  assert.throws(() => ctx.addCoachContext('u4', { reason: 'travel', from: '2026-01-01', to: '2027-12-31' }), /at most/)
  const saved = ctx.addCoachContext('u4', { reason: 'work', from: '2026-09-04', to: '2026-09-05' })
  assert.equal(ctx.removeCoachContext('u4', saved.id), true)
  ctx.recordCoachUserMessage('u4', { jobId: 'j2', message: 'test' })
  ctx.clearCoachContext('u4')
  assert.deepEqual(ctx.readCoachContext('u4'), { messages: [], contexts: [] })
})
