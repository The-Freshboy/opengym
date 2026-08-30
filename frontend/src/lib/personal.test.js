import { describe, it, expect } from 'vitest'
import { acceptPersonalProposal, preparePersonalEntry, sessionExercises, protectedPlanErrors, GOAL_TEMPLATES, validateResult, goalReached, weeklySummary, exerciseHistory } from './personal.js'
import { validateFullBackup, backupComparison } from './recovery.js'
import { applyChangeSet } from './coach.js'

const cfg = { id: '0001', mode: 'reps', sets: 2, reps: 8, weight: 20, inc: 2.5, prog: 'linear' }
const routine = { id: 'r', name: 'A', ex: [cfg] }
const state = (n = 3) => ({ unit: 'kg', routines: [structuredClone(routine)], week: {}, workouts: ['2026-08-20', '2026-08-23', '2026-08-27'].slice(0, n).map((d, i) => ({ id: 'w' + i, d, routineId: 'r', unit: 'kg', entries: [{ id: cfg.id, target: { ...cfg }, sets: [{ w: 20, r: 8, done: true, rir: 3 }, { w: 20, r: 8, done: true, rir: 2 }] }] })), exWeights: { '0001': { w: 100 } } })
const prepare = s => preparePersonalEntry(s, cfg, routine, '2026-08-30')
describe('personal progression approval', () => {
  it('does not use a historical maximum as today’s working weight', () => { const e = prepare(state(1)); expect(e.sets[0].w).toBe(20); expect(e.proposal).toBeUndefined() })
  it('never advances from one or two sessions', () => { expect(prepare(state(1)).proposal).toBeUndefined(); expect(prepare(state(2)).proposal).toBeUndefined() })
  it('requires explicit acceptance and leaves the routine untouched', () => { const s = state(), before = structuredClone(s); const e = prepare(s); expect(e.proposal.weight).toBe(22.5); expect(e.sets[0].w).toBe(20); acceptPersonalProposal(e); expect(e.sets[0].w).toBe(22.5); expect(e.target.weight).toBe(22.5); expect(e.proposal.status).toBe('accepted'); expect(s).toEqual(before) })
  it('blocks acceptance after manual edits, completed sets or an earlier decision', () => { for (const mutate of [e => { e.sets[0].w = 15 }, e => { e.sets[0].done = true }, e => { e.proposal.status = 'declined' }]) { const e = prepare(state()); mutate(e); expect(() => acceptPersonalProposal(e)).toThrow() } })
  it('blocks progression with discomfort or today’s pain flag', () => { const s = state(); s.workouts[2].feedback = { jointDiscomfort: true }; expect(prepare(s).plan.safety).toBe(true); s.workouts[2].feedback = {}; s.readiness = { '2026-08-30': { pain: true } }; expect(prepare(s).proposal).toBeUndefined() })
  it('does not treat unrecorded discomfort as a reported absence', () => { expect(state().workouts[0].feedback).toBeUndefined(); expect(prepare(state()).proposal).toBeDefined() })
  it('requires comparable dates, routine, mode, volume, load and completion', () => {
    const cases = [s => { s.workouts[2].d = s.workouts[1].d }, s => { s.workouts[2].routineId = 'other' }, s => { s.workouts[2].incomplete = true }, s => { s.workouts[2].variant = 'short' }, s => { s.workouts[0].d = '2026-01-01' }, s => { s.workouts[1].entries[0].sets[0].w = 15 }, s => { s.workouts[2].entries[0].target.reps = 12 }, s => { s.workouts[1].unit = 'lb' }]
    for (const mutate of cases) { const s = state(); mutate(s); expect(prepare(s).proposal).toBeUndefined() }
  })
  it('high effort or mixed outcomes do not prompt an increase', () => { const s = state(); s.workouts[2].entries[0].sets[1].rir = 0; expect(prepare(s).proposal).toBeUndefined(); delete s.workouts[2].entries[0].sets[1].rir; s.workouts[1].entries[0].sets[0].r = 4; expect(prepare(s).proposal).toBeUndefined() })
  it('three target misses offer a reduction without applying it', () => { const s = state(); for (const w of s.workouts) w.entries[0].sets[1].r = 5; const e = prepare(s); expect(e.proposal.kind).toBe('deload'); expect(e.sets[0].w).toBe(20) })
  it('never derives cardio performance from lifting history', () => { const e = preparePersonalEntry(state(), { ...cfg, mode: 'cardio', min: 20 }, routine, '2026-08-30'); expect(e.proposal).toBeUndefined() })
  it('requires an explicitly configured increment', () => { const e = preparePersonalEntry(state(), { ...cfg, inc: undefined }, routine, '2026-08-30'); expect(e.proposal).toBeUndefined() })
  it('keeps accepted time and bodyweight-rep targets across sessions without editing the routine', () => {
    for (const mode of ['time', 'reps']) {
      const c = { ...cfg, mode, weight: 0, ...(mode === 'time' ? { sec: 10, prog: 'time', inc: 5 } : {}) }
      const r = { ...routine, ex: [c] }, s = state()
      s.routines = [structuredClone(r)]
      for (const w of s.workouts) w.entries = [{ id: c.id, target: { ...c }, sets: Array.from({ length: 2 }, () => ({ w: 0, ...(mode === 'time' ? { sec: 10 } : { r: 8 }), done: true })) }]
      const first = preparePersonalEntry(s, c, r, '2026-08-28'); acceptPersonalProposal(first)
      const key = mode === 'time' ? 'sec' : 'r', targetKey = mode === 'time' ? 'sec' : 'reps', next = mode === 'time' ? 15 : 9
      expect(first.sets[0][key]).toBe(next)
      for (const d of ['2026-08-28', '2026-08-29', '2026-08-30']) {
        const e = d === '2026-08-28' ? first : preparePersonalEntry(s, c, r, d)
        expect(e.sets[0][key]).toBe(next); expect(e.target[targetKey]).toBe(next)
        e.sets.forEach(set => { set.done = true }); delete e.proposal
        s.workouts.push({ id: d, d, routineId: r.id, unit: 'kg', entries: [e] })
      }
      const later = preparePersonalEntry(s, c, r, '2026-08-31')
      expect(later.sets[0][key]).toBe(next)
      expect(later.proposal[targetKey]).toBe(mode === 'time' ? 20 : 10)
      expect(s.routines[0].ex[0]).toEqual(c)
    }
  })
  it('explicit plan changes override carried loads and accepted targets', () => {
    const s = state(), e = prepare(s); acceptPersonalProposal(e); e.sets.forEach(set => { set.done = true })
    s.workouts.push({ id: 'accepted', d: '2026-08-29', routineId: 'r', unit: 'kg', entries: [e] })
    const changed = { ...cfg, weight: 15, reps: 6 }
    const next = preparePersonalEntry(s, changed, { ...routine, ex: [changed] }, '2026-08-30')
    expect(next.sets[0]).toMatchObject({ w: 15, r: 6 }); expect(next.proposal).toBeUndefined()
    const legacy = preparePersonalEntry(state(), changed, routine, '2026-08-30')
    expect(legacy.sets[0]).toMatchObject({ w: 15, r: 6 }); expect(legacy.proposal).toBeUndefined()
  })
  it('double progression rebuilds reps at the accepted load before offering another load increase', () => {
    const c = { ...cfg, prog: 'double', repsMin: 6 }, r = { ...routine, ex: [c] }, s = state()
    s.routines = [r]
    for (const w of s.workouts) w.entries[0].target = { ...c }
    let e = preparePersonalEntry(s, c, r, '2026-08-28')
    expect(e.proposal).toMatchObject({ weight: 22.5, reps: 6 }); acceptPersonalProposal(e)
    let day = 28
    for (const expected of [7, 8]) {
      for (let i = 0; i < 3; i++) {
        const d = new Date(Date.UTC(2026, 7, day++)).toISOString().slice(0, 10)
        e.sets.forEach(set => { set.done = true }); delete e.proposal
        s.workouts.push({ id: d, d, routineId: 'r', unit: 'kg', entries: [e] })
        e = preparePersonalEntry(s, c, r, new Date(Date.UTC(2026, 7, day)).toISOString().slice(0, 10))
      }
      expect(e.proposal).toMatchObject({ weight: 22.5, reps: expected })
      expect(e.sets[0].w).toBe(22.5); acceptPersonalProposal(e)
    }
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.UTC(2026, 7, day++)).toISOString().slice(0, 10)
      e.sets.forEach(set => { set.done = true }); delete e.proposal
      s.workouts.push({ id: d, d, routineId: 'r', unit: 'kg', entries: [e] })
      e = preparePersonalEntry(s, c, r, new Date(Date.UTC(2026, 7, day)).toISOString().slice(0, 10))
    }
    expect(e.proposal).toMatchObject({ weight: 25, reps: 6 }); expect(e.sets[0].w).toBe(22.5)
  })
  it('shows notes and effort in reverse chronological order without changing history', () => { const s = state(); s.workouts[2].entries[0].note = 'Grip felt better'; expect(exerciseHistory(s, cfg.id)[0].note).toBe('Grip felt better'); expect(exerciseHistory(s, cfg.id, 'w2')[0].d).toBe('2026-08-23') })
})
describe('mandatory exercises and shorter sessions', () => {
  it('never omits unmarked or protected exercises', () => { const r = { ex: [{ id: 'a' }, { id: 'b', optional: true }, { id: 'c', optional: true, mandatory: true }] }; expect(sessionExercises(r, 'short').map(x => x.id)).toEqual(['a', 'c']); expect(sessionExercises(r)).toHaveLength(3) })
  it('blocks imports removing or unprotecting a base exercise', () => { const s = state(); s.routines[0].ex[0].mandatory = true; expect(protectedPlanErrors(s, state())).toHaveLength(1); expect(protectedPlanErrors(s, { routines: [] })).toHaveLength(1); expect(protectedPlanErrors(s, structuredClone(s))).toEqual([]) })
  it('blocks coach removal and swaps even when accepted', () => { const s = state(); s.routines[0].ex[0].mandatory = true; for (const type of ['remove-exercise', 'swap-exercise', 'remove-routine']) { expect(() => applyChangeSet(structuredClone(s), { id: 'p', kind: 'review', changes: [{ id: 'c', type, target: { routineId: 'r', exId: '0001' }, after: { id: '0002' }, why: 'test' }] }, ['c'])).toThrow(/mandatory/) } })
})
describe('real test results', () => {
  const beep = GOAL_TEMPLATES.find(g => g.kind === 'beep'), hang = GOAL_TEMPLATES[0]
  it('does not allow a beep baseline before 10 September', () => { expect(validateResult(beep, { d: '2026-09-09', value: 7, shuttle: 5 }, '2026-09-10')).toContain('2026-09-10'); expect(validateResult(beep, { d: '2026-09-10', value: 7, shuttle: 5 }, '2026-09-10')).toBeNull() })
  it('uses level and shuttle, not a decimal or a treadmill estimate', () => { expect(goalReached(beep, { value: 7, shuttle: 4 })).toBe(false); expect(goalReached(beep, { value: 7, shuttle: 5 })).toBe(true); expect(goalReached(beep, { value: 8, shuttle: 1 })).toBe(true); expect(validateResult(beep, { d: '2026-09-10', value: 7.5 }, '2026-09-10')).not.toBeNull() })
  it('rejects future dates, invalid dates and unconfirmed hang standards', () => { expect(validateResult(hang, { d: '2026-09-01', value: 25, standard: true }, '2026-08-30')).not.toBeNull(); expect(validateResult(hang, { d: '2026-02-30', value: 25, standard: true }, '2026-08-30')).not.toBeNull(); expect(validateResult(hang, { d: '2026-08-30', value: 25 }, '2026-08-30')).not.toBeNull() })
  it('counts only logged sessions in the current Monday–Sunday week', () => { const s = state(); s.workouts.push({ id: 'activity', d: '2026-08-29', kind: 'activity', activityType: 'Climbing', entries: [] }); expect(weeklySummary(s, '2026-08-30')).toMatchObject({ from: '2026-08-24', sessions: 2, climbing: 1 }) })
})
describe('restore validation and preview', () => {
  it('validates a legacy full backup without dropping unknown fields', () => { const s = { ...state(), extra: { preserved: true } }; expect(validateFullBackup(s)).toBe(s) })
  it('rejects malformed and dangerous backups before changing anything', () => { for (const x of [null, [], {}, { routines: [], workouts: [{ id: 'w', d: '2026-08-30', entries: false }] }, JSON.parse('{"routines":[],"workouts":[],"__proto__":{}}')]) expect(() => validateFullBackup(x)).toThrow() })
  it('reports history that would disappear rather than only changed counts', () => { expect(backupComparison(state(), state(1))).toMatchObject({ removedWorkouts: 2, before: { workouts: 3 }, after: { workouts: 1 } }) })
})
