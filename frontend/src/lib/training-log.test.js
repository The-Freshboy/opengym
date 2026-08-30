import { describe, it, expect } from 'vitest'
import { isWorkingSet, sessionLoad, hangContextLabel, nerveSymptomsReported, trainingContext, duplicateKnownHistory, repCountLabel, editTrainingBlock } from './training-log.js'
import { expandedRecords, insightSummary } from './insights.js'
import { bestSetOf } from './onerm.js'
import { readSession } from './progression.js'
import { preparePhysioReport } from './physio-report.js'

describe('honest training records and optional context', () => {
  it('requires confirmation and a real past date for historical copies', () => {
    const w = { id: 'old', start: 1, end: 60001, feedback: { numbness: true }, note: 'prior symptoms', entries: [{ sets: [{ done: true, r: 8 }] }] }
    expect(() => duplicateKnownHistory(w, '2026-08-29', '2026-08-30', 'new', false)).toThrow()
    for (const date of ['2026-08-31', '2026-02-30', '']) expect(() => duplicateKnownHistory(w, date, '2026-08-30', 'new', true)).toThrow()
    const copy = duplicateKnownHistory(w, '2026-08-29', '2026-08-30', 'new', true)
    expect(copy.copiedHistory).toBe(true); expect(copy.feedback).toBeUndefined(); expect(copy.note).toBeUndefined(); expect(w.feedback.numbness).toBe(true)
  })
  it('labels per-side intent without changing the count', () => {
    expect(repCountLabel(12, 'total-both-sides')).toBe('12 total (6 each side)')
    expect(repCountLabel(6, 'per-side')).toBe('6 each side')
    expect(repCountLabel(12)).toBe('12')
    expect(repCountLabel(5, 'total-both-sides')).toContain('across both sides')
  })
  it('edits and archives block metadata without rewriting history', () => {
    const block = { id: 'b', name: 'Base', weeks: 4, active: true }
    expect(editTrainingBlock(block, { name: 'Build', active: false })).toMatchObject({ id: 'b', name: 'Build', active: false })
    expect(block.active).toBe(true)
    expect(() => editTrainingBlock(block, { weeks: 0 })).toThrow()
    expect(() => editTrainingBlock(block, { name: '' })).toThrow()
  })
  it('takes an independent equipment snapshot without inventing a load', () => {
    const p = { activeEquipmentProfileId: 'home', equipmentProfiles: [{ id: 'home', name: 'Home', equipment: 'Hangboard' }], sessionMinutes: 30 }
    const snapshot = trainingContext(p); p.equipmentProfiles[0].name = 'Changed'
    expect(snapshot.equipmentProfile.name).toBe('Home'); expect(snapshot.plannedMinutes).toBe(30)
    expect(snapshot.weight).toBeUndefined()
  })
  it('preserves legacy working sets and excludes warm-ups from records', () => {
    expect(isWorkingSet({ done: true })).toBe(true)
    expect(isWorkingSet({ done: true, type: 'warmup' })).toBe(false)
    const result = expandedRecords({ unit: 'kg', workouts: [{ d: '2026-08-30', unit: 'kg', entries: [{ id: 'test', sets: [{ sec: 30, done: true }, { sec: 10, done: true }, { r: 8, w: 40, done: true }, { r: 1, w: 100, done: true, type: 'warmup' }] }] }] })
    expect(result.find(x => x.type === 'Longest timed hold').score).toBe(30)
    expect(result.find(x => x.type.startsWith('Heaviest')).score).toBe(40)
  })
  it('does not use warm-up effort as strength or progression evidence', () => {
    const e = { target: { mode: 'reps', sets: 1, reps: 8 }, sets: [{ done: true, r: 1, w: 100, type: 'warmup' }, { done: true, r: 8, w: 20 }] }
    expect(bestSetOf(e).w).toBe(20)
    expect(readSession(e).weight).toBe(20)
    expect(readSession(e).ok).toBe(true)
  })
  it('never assumes missing or invalid effort', () => {
    expect(sessionLoad({ durationMin: 60 })).toBeNull()
    expect(sessionLoad({ durationMin: 60, sessionRpe: 11 })).toBeNull()
    expect(sessionLoad({ durationMin: 60, sessionRpe: 4 })).toBe(240)
    const s = { routines: [], workouts: [{ d: '2026-08-29', durationMin: 60 }, { d: '2026-08-28', durationMin: 30, intensity: 3 }] }
    const x = insightSummary(s, new Date('2026-08-30T12:00:00'))
    expect(x.ratedSessions).toBe(1); expect(x.workload).toBe(90); expect(x.workloadChange).toBeNull()
  })
  it('recognises explicit symptoms only and does not infer assistance', () => {
    expect(nerveSymptomsReported({})).toBe(false)
    expect(nerveSymptomsReported({ numbness: true })).toBe(true)
    expect(hangContextLabel({ support: 'feet on floor' })).toBe('Assistance: feet on floor')
  })
  it('requires feedback opt-in for nerve information and notes opt-in for hold context', () => {
    const S = { unit: 'kg', workouts: [{ d: '2026-08-30', feedback: { tingling: true, symptomLocation: 'PRIVATE LOCATION' }, entries: [{ id: 'hang', hangContext: { support: 'PRIVATE SUPPORT' }, sets: [{ done: true, sec: 5, type: 'warmup' }] }] }] }
    const options = { from: '2026-08-01', to: '2026-08-30' }
    const basic = JSON.stringify(preparePhysioReport(S, options))
    expect(basic).not.toContain('PRIVATE'); expect(basic).not.toContain('tingling:')
    const shared = JSON.stringify(preparePhysioReport(S, { ...options, feedback: true, notes: true }))
    expect(shared).toContain('tingling: yes'); expect(shared).toContain('PRIVATE SUPPORT'); expect(shared).toContain('1 W')
  })
})
