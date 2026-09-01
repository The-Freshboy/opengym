import { describe, expect, it } from 'vitest'
import { warmupRamp, insertWarmups, plateLoading, equipmentAvailable, approvedAlternatives, applyApprovedSubstitution } from './workout-tools.js'

describe('workout tools', () => {
  it('calculates editable warm-up loads without changing working sets', () => {
    const entry = { id: 'x', target: { mode: 'reps', reps: 8 }, sets: [{ w: 80, r: 8, done: false }] }
    expect(warmupRamp(entry, 2.5)).toEqual([{ w: 40, r: 8, type: 'warmup', done: false }, { w: 60, r: 5, type: 'warmup', done: false }])
    expect(entry.sets).toEqual([{ w: 80, r: 8, done: false }])
    expect(insertWarmups(entry, warmupRamp(entry, 2.5))).toBe(true)
    expect(entry.sets.map(s => s.type)).toEqual(['warmup', 'warmup', undefined])
  })
  it('does not insert warm-ups after logging starts or for timed work', () => {
    const started = { id: 'x', target: { mode: 'reps' }, sets: [{ w: 50, r: 8, done: true }] }
    expect(insertWarmups(started, [{ w: 20, r: 5 }])).toBe(false)
    expect(warmupRamp({ id: 'x', target: { mode: 'time' }, sets: [{ sec: 5 }] })).toEqual([])
  })
  it('calculates symmetric plate loading and reports an honest remainder', () => {
    expect(plateLoading(100, 20, [20, 10, 5, 2.5])).toEqual({ perSide: [20, 20], loaded: 100, remainder: 0 })
    expect(plateLoading(103, 20, [20, 10, 5, 2.5])).toEqual({ perSide: [20, 20], loaded: 100, remainder: 3 })
    expect(plateLoading(10, 20, [5])).toEqual({ perSide: [], loaded: 20, remainder: 0 })
  })
  it('labels equipment matching as true, false or unknown without substituting', () => {
    expect(equipmentAvailable({ eq: 'barbell' }, { equipment: 'Rack, barbell, dumbbells' })).toBe(true)
    expect(equipmentAvailable({ eq: 'cable' }, { equipment: 'Rack, barbell' })).toBe(false)
    expect(equipmentAvailable({ eq: 'cable' }, null)).toBeNull()
    expect(equipmentAvailable({ eq: 'body weight' }, { equipment: 'mat' })).toBe(true)
  })
  it('only returns explicitly approved exercise ids', () => {
    expect(approvedAlternatives({ target: {} }, null)).toEqual([])
    expect(approvedAlternatives({ target: { substitutes: ['does-not-exist'] } }, null)).toEqual([])
  })
  it('substitutes only before logging, preserves supersets and records the audit trail', () => {
    const active = { entries: [{ id: 'old', sg: 'pair-1', note: 'seat 3', target: { substitutes: ['new'] }, sets: [{ w: 20, r: 8, done: false }] }] }
    expect(applyApprovedSubstitution(active, 0, 'new', id => ({ id, target: { mode: 'reps' }, sets: [{ w: 0, r: 8, done: false }] }))).toBe(true)
    expect(active.entries[0]).toMatchObject({ id: 'new', sg: 'pair-1', note: 'seat 3', target: { substitutedFrom: 'old', approvedForSession: true } })
    expect(active.entries[0].sets[0].w).toBe(0)
    const started = { entries: [{ id: 'old', target: { substitutes: ['new'] }, sets: [{ done: true }] }] }
    expect(applyApprovedSubstitution(started, 0, 'new', id => ({ id }))).toBe(false)
    expect(started.entries[0].id).toBe('old')
  })
})
