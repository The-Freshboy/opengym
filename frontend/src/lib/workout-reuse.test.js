import { describe, it, expect } from 'vitest'
import { repeatableSets, reuseReason, lastLoggedExercise, repeatLastSessionPlan, applyRepeatedSets } from './workout-reuse.js'

const entry = () => ({ id: '0308', target: { mode: 'reps' }, sets: [{ w: 20, r: 10, done: true, rir: 2, timerConfirmed: true, pr: true }] })
const active = () => ({ id: 'now', routineId: 'r', d: '2026-08-31', unit: 'kg', entries: [{ ...entry(), sets: [{ w: 10, r: 8, done: false }] }] })
const workout = () => ({ id: 'old', d: '2026-08-30', routineId: 'r', unit: 'kg', entries: [entry()] })
describe('safe last-time prefills', () => {
  it('copies only working prescription numbers, never achievements or effort', () => {
    const previous = entry()
    previous.sets.push({ w: 5, r: 15, done: true, type: 'warmup' }, { w: 30, r: 5, done: false })
    expect(repeatableSets(previous)).toEqual([{ w: 20, r: 10, done: false, type: 'working' }])
    expect(previous.sets[0].timerConfirmed).toBe(true)
  })
  it('copies cardio and time numbers without cross-mode fields', () => {
    expect(repeatableSets({ target: { mode: 'cardio' }, sets: [{ done: true, min: 20, speed: 8, w: 20 }] })).toEqual([{ done: false, type: 'working', min: 20, speed: 8 }])
    expect(repeatableSets({ target: { mode: 'time' }, sets: [{ done: true, sec: 12, w: 0, timerConfirmed: true, r: 5 }] })).toEqual([{ done: false, type: 'working', sec: 12, w: 0 }])
  })
  it('rejects missing or mismatched units, equipment, modes and rep conventions', () => {
    expect(reuseReason(active(), entry(), workout(), entry())).toBe('')
    for (const unit of [undefined, 'lb']) expect(reuseReason(active(), entry(), { ...workout(), unit }, entry())).toMatch(/units/)
    expect(reuseReason(active(), entry(), { ...workout(), trainingContext: { equipmentProfile: { id: 'other' } } }, entry())).toMatch(/Equipment/)
    expect(reuseReason(active(), entry(), workout(), { ...entry(), target: { mode: 'time' } })).toMatch(/mode/)
    expect(reuseReason(active(), entry(), workout(), { ...entry(), target: { mode: 'reps', repsConvention: 'per-side' } })).toMatch(/convention/)
  })
  it('requires complete matching hold context and distinguishes assistance', () => {
    const e = { ...entry(), target: { mode: 'time' }, sets: [{ done: true, sec: 10, w: 0 }] }
    expect(reuseReason(active(), e, workout(), e)).toMatch(/Record matching/)
    e.hangContext = { hold: 'Straight bar', grip: 'Overhand', support: 'Feet supported', elbow: 'Flexed' }
    expect(reuseReason(active(), e, workout(), e)).toBe('')
    expect(reuseReason(active(), e, workout(), { ...e, hangContext: { ...e.hangContext, support: 'Unassisted' } })).toMatch(/differs/)
    for (const key of ['hold', 'grip', 'elbow']) expect(reuseReason(active(), e, workout(), { ...e, hangContext: { ...e.hangContext, [key]: 'different' } })).toMatch(/differs/)
  })
  it('rejects ambiguous individual exercise repeats and absent active sessions', () => {
    const w = workout(); w.entries.push(entry())
    expect(reuseReason(active(), entry(), w, w.entries[0])).toMatch(/Multiple previous/)
    expect(lastLoggedExercise({ workouts: [w] }, entry())).toBeNull()
  })
  it('enforces clean unchecked numeric fields at the mutation boundary', () => {
    const e = active().entries[0]
    applyRepeatedSets(e, [{ done: true, type: 'working', w: 20, r: 10, rir: 1, timerConfirmed: true, pr: true, note: 'old' }])
    expect(e.sets).toEqual([{ done: false, type: 'working', w: 20, r: 10 }])
    expect(() => applyRepeatedSets(e, [{ r: NaN, w: 10 }])).toThrow(/No valid/)
    expect(e.sets).toEqual([{ done: false, type: 'working', w: 20, r: 10 }])
  })
  it('keeps warm-ups, clears stale progression, and will not overwrite completed sets', () => {
    const e = { ...active().entries[0], proposal: {}, plan: {}, topW: 99, asked: true }
    e.sets.unshift({ type: 'warmup', w: 5, r: 10, done: false })
    applyRepeatedSets(e, repeatableSets(entry()))
    expect(e.sets).toHaveLength(2)
    expect(e.sets[0].type).toBe('warmup')
    expect(e.proposal).toBeUndefined()
    expect(e.topW).toBeUndefined()
    e.sets[0].done = true
    expect(() => applyRepeatedSets(e, [])).toThrow(/Training has started/)
  })
  it('finds most recent actual dated exercise and excludes edited workout/future history', () => {
    const state = { active: { ...active(), editingWorkoutId: 'edited' }, workouts: [workout(), { ...workout(), id: 'future', d: '2026-09-01' }, { ...workout(), id: 'edited', d: '2026-08-31' }] }
    expect(lastLoggedExercise(state, entry()).workout.id).toBe('old')
  })
  it('session repeat does not copy notes, check-ins, routine configuration or completed history', () => {
    const a = active()
    const w = { ...workout(), note: 'old note', nextDayCheckIn: { numbness: true } }
    const plan = repeatLastSessionPlan({ active: a, workouts: [w] })
    expect(plan.matches).toHaveLength(1)
    plan.matches.forEach(({ index, sets }) => applyRepeatedSets(a.entries[index], sets))
    expect(a.entries[0].sets[0].done).toBe(false)
    expect(a.entries[0].target).toEqual({ mode: 'reps' })
    expect(a.nextDayCheckIn).toBeUndefined()
    expect(w.entries[0].sets[0].done).toBe(true)
  })
  it('skips ambiguous duplicate IDs, copied history and unmatched exercises', () => {
    const a = active()
    expect(repeatLastSessionPlan({ active: a, workouts: [{ ...workout(), copiedHistory: true }] })).toBeNull()
    const w = workout(); w.entries.push(entry())
    expect(repeatLastSessionPlan({ active: a, workouts: [w] }).matches).toEqual([])
    expect(repeatLastSessionPlan({ active: { ...a, editingWorkoutId: 'x' }, workouts: [workout()] })).toBeNull()
  })
})
