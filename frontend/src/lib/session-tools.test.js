import { describe, it, expect } from 'vitest'
import { exerciseRest, validRest, linkedHang, confirmLinkedHangs, deferExercise, saveSetup, setupKey } from './session-tools.js'
import { changeTimeline } from './change-timeline.js'

const state = () => ({ restSec: 90, routines: [{ id: 'r', ex: [{ id: 'hang', mandatory: true }] }], active: { id: 'a', cur: 0, entries: [
  { id: 'hang', target: { mode: 'time', mandatory: true, restSec: 120 }, sets: [{ sec: 5, done: false }, { sec: 5, done: false }] },
  { id: 'other', target: {}, sets: [{ r: 10, done: false }] }
] } })

describe('session tools', () => {
  it('inherits rest, respects zero and ignores malformed rest', () => {
    const s = state(), e = s.active.entries[0]
    expect(exerciseRest(s, e)).toBe(120)
    e.restSec = 0; expect(exerciseRest(s, e)).toBe(0)
    e.restSec = -1; expect(exerciseRest(s, e)).toBe(120)
    expect(validRest('')).toBe(false); expect(validRest(1.5)).toBe(false)
  })
  it('links remaining working sets without changing prescription or logging', () => {
    const s = state(); s.active.entries[0].sets.unshift({ sec: 2, type: 'warmup', done: false })
    const before = JSON.stringify(s), link = linkedHang(s, 0)
    expect(link.config).toMatchObject({ hang: 5, sets: 2, rest: 120 })
    expect(link.indices).toEqual([1, 2]); expect(JSON.stringify(s)).toBe(before)
    confirmLinkedHangs(s, link, ['4', ''])
    expect(s.active.entries[0].sets.map(v => v.done)).toEqual([false, true, false])
    expect(s.active.entries[0].sets[1].sec).toBe(4)
    expect(s.routines).toEqual(JSON.parse(before).routines)
    expect(() => confirmLinkedHangs(s, link, ['5', '5'])).toThrow('changed')
  })
  it('rejects blank, negative and fractional achieved values without partial writes', () => {
    const s = state(), link = linkedHang(s, 0), before = JSON.stringify(s)
    for (const values of [['', ''], ['5', '-1'], ['5', '2.5'], ['5']]) expect(() => confirmLinkedHangs(s, link, values)).toThrow()
    expect(JSON.stringify(s)).toBe(before)
  })
  it('does not run unequal targets, supersets, edited history or completed exercises', () => {
    const s = state(); s.active.entries[0].sets[1].sec = 6
    expect(linkedHang(s, 0)).toBeNull()
    s.active.entries[0].sets[1].sec = 5
    s.active.entries.forEach(e => { e.sg = 'pair' }); expect(linkedHang(s, 0)).toBeNull()
    s.active.entries.forEach(e => { delete e.sg }); s.active.editingWorkoutId = 'old'
    expect(linkedHang(s, 0)).toBeNull()
  })
  it('defers whole unstarted supersets without changing mandatory plan', () => {
    const s = state(); s.active.entries.forEach(e => { e.sg = 'pair' })
    s.active.entries.push({ id: 'third', sets: [] }); const plan = JSON.stringify(s.routines)
    expect(deferExercise(s, 0)).toBe(true)
    expect(s.active.entries.map(e => e.id)).toEqual(['third', 'hang', 'other'])
    expect(s.active.entries[1].target.mandatory).toBe(true)
    expect(JSON.stringify(s.routines)).toBe(plan)
    expect(deferExercise(s, 1)).toBe(false)
  })
  it('does not defer started entries', () => {
    const s = state(); s.active.entries[0].sets[0].done = true
    expect(deferExercise(s, 0)).toBe(false)
  })
  it('saves isolated setup snapshots without transferring weight or assistance', () => {
    const s = state(), before = JSON.stringify(s.active.entries[0].sets)
    saveSetup(s, 0, 'Seat 4', '2026-08-31T00:00:00Z')
    expect(s.active.entries[0].setupContext.note).toBe('Seat 4')
    expect(JSON.stringify(s.active.entries[0].sets)).toBe(before)
    const oldKey = setupKey(s.active, 'hang')
    s.active.trainingContext = { equipmentProfile: { id: 'hotel', name: 'Hotel' } }
    saveSetup(s, 0, 'Seat 2')
    expect(setupKey(s.active, 'hang')).not.toBe(oldKey)
    expect(s.trainingPreferences.exerciseSetups).toHaveLength(2)
    expect(s.setupHistory[0].note).toBe('Seat 4')
  })
  it('builds a sorted bounded timeline without mutating records', () => {
    const s = { programmeHistory: [{ at: '2026-08-30T00:00:00Z', changedDates: ['2026-09-01'] }], workouts: [{ d: '2026-08-31', name: 'Gym', note: 'Comment', nextDayCheckIn: { status: 'recorded', date: '2026-09-01', change: 'same' } }] }
    const before = JSON.stringify(s), rows = changeTimeline(s)
    expect(rows.map(r => r.type)).toEqual(['check-ins', 'comments', 'programme'])
    expect(JSON.stringify(s)).toBe(before)
    expect(changeTimeline({})).toEqual([])
  })
})
