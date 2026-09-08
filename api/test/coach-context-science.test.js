import test from 'node:test'
import assert from 'node:assert/strict'
import { adherenceContext, applyCoachContextToScience, explainedMissedDates } from '../coach-context-science.js'

const workout = d => ({ d, entries: [] })

test('explained travel days exclude only planned missed dates, not completed dates', () => {
  const payload = {
    plan: { week: { 1: 'r', 2: 'r', 3: 'r', 4: 'r', 5: 'r' } },
    window: { from: '2026-09-01', to: '2026-09-14', workouts: [workout('2026-09-01'), workout('2026-09-02'), workout('2026-09-07')] },
    userContext: [{ reason: 'travel', from: '2026-09-03', to: '2026-09-08', affectsAdherence: true }]
  }
  assert.deepEqual(explainedMissedDates(payload), ['2026-09-03', '2026-09-04', '2026-09-08'])
})

test('low observed adherence can become explained rather than a schedule-change signal', () => {
  const sessions = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-08','2026-09-09','2026-09-10'].map(workout)
  const payload = {
    plan: { week: { 0:'r',1:'r',2:'r',3:'r',4:'r',5:'r',6:'r' } },
    window: { from: '2026-09-01', to: '2026-09-15', workouts: sessions },
    userContext: [{ reason: 'travel', from: '2026-09-11', to: '2026-09-15', affectsAdherence: true }]
  }
  const a = adherenceContext(payload)
  assert.equal(a.expected, 14)
  assert.equal(a.sessions, 8)
  assert.equal(a.explainedDates.length, 5)
  assert.ok(a.observedRate < .7)
  assert.ok(a.adjustedRate >= .7)

  const science = { measurements: {}, limitations: [], findings: [{ id: 'adherence-low', category: 'adherence', severity: 'action', metric: {}, reading: 'raw' }] }
  const adjusted = applyCoachContextToScience(science, payload)
  assert.equal(adjusted.findings.some(f => f.id === 'adherence-low'), false)
  const explained = adjusted.findings.find(f => f.id === 'adherence-explained')
  assert.ok(explained)
  assert.match(explained.reading, /raw rate should not by itself/)
})

test('equipment notes do not change adherence unless explicitly marked', () => {
  const payload = {
    plan: { week: { 1:'r',3:'r',5:'r' } },
    window: { from: '2026-09-01', to: '2026-09-14', workouts: [workout('2026-09-02')] },
    userContext: [{ reason: 'equipment', from: '2026-09-01', to: '2026-09-14', affectsAdherence: false }]
  }
  assert.deepEqual(explainedMissedDates(payload), [])
})
