import { describe, expect, it } from 'vitest'
import { applyReviewedPlan, compareReviewedBackup, restoreReviewedPlan, snapshotPlan, validateReviewedBackup } from './backup-review.js'

const routine = (id, name = id, ex = []) => ({ id, name, ex })
const state = over => ({ routines: [routine('a')], week: { 1: 'a' }, dayPlan: {}, customEx: [], exWeights: {}, workouts: [{ id: 'w1' }], bodyweight: [{ d: '2026-01-01', w: 80 }], theme: 'dark', ...over })

describe('reviewed backup imports', () => {
  it('shows exact prescription, instruction, date and load changes with exercise names', () => {
    const before = state({ routines: [routine('a', 'Strength', [{ id: 'hang', sets: 2, reps: 1, sec: 5 }])], customEx: [{ id: 'hang', n: 'Supported hang', desc: 'Old instructions' }], exWeights: { hang: { w: 0 } } })
    const incoming = structuredClone(before)
    incoming.routines[0].ex[0] = { id: 'hang', sets: 3, reps: 2, sec: 10 }
    incoming.customEx[0].desc = 'New instructions'
    incoming.dayPlan['2026-09-07'] = 'a'
    incoming.exWeights.hang.w = 5
    const result = compareReviewedBackup(before, incoming)
    const changes = result.sections.flatMap(section => section.changes)
    expect(changes).toContainEqual({ field: '2026-09-07', before: 'Not set', after: 'Strength' })
    expect(changes).toContainEqual({ field: 'Supported hang → Weight', before: '0', after: '5' })
    expect(changes.find(c => c.field.endsWith('→ Sets'))).toMatchObject({ before: '2', after: '3' })
    expect(changes.find(c => c.field.endsWith('→ Duration (seconds)'))).toMatchObject({ before: '5', after: '10' })
    expect(changes.find(c => c.field.endsWith('→ Instructions'))).toMatchObject({ before: 'Old instructions', after: 'New instructions' })
  })
  it('detects order-only changes and does not truncate beyond eight changes', () => {
    const before = state({ routines: Array.from({ length: 12 }, (_, i) => routine(String(i))) })
    const incoming = { ...before, routines: [...before.routines].reverse() }
    const result = compareReviewedBackup(before, incoming)
    expect(result.changed).toBe(true)
    expect(result.sections[0].summary).toBe('Order changed')
    expect(result.sections[0].changes.length).toBeGreaterThan(8)
  })
  it('identical plans ignore history changes and comparisons do not mutate input', () => {
    const before = state()
    const original = JSON.stringify(before)
    expect(compareReviewedBackup(before, state({ workouts: [] })).changed).toBe(false)
    expect(JSON.stringify(before)).toBe(original)
  })
  it('reports plan changes without treating history or preferences as changes', () => {
    const before = state()
    const incoming = state({ routines: [routine('a', 'Updated'), routine('b')], week: { 2: 'b' }, workouts: [], theme: 'light' })
    const result = compareReviewedBackup(before, incoming)
    expect(result.sections.map(x => x.key)).toEqual(['routines', 'week'])
  })
  it('applies only plan fields and preserves logged data and preferences', () => {
    const target = state(); const backup = snapshotPlan(target)
    applyReviewedPlan(target, state({ routines: [routine('b')], week: { 2: 'b' }, workouts: [], bodyweight: [], theme: 'light' }))
    expect(target.routines[0].id).toBe('b')
    expect(target.workouts).toHaveLength(1)
    expect(target.bodyweight).toHaveLength(1)
    expect(target.theme).toBe('dark')
    restoreReviewedPlan(target, backup)
    expect(target.routines[0].id).toBe('a')
  })
  it('rejects broken schedule references', () => {
    const result = validateReviewedBackup(state({ week: { 1: 'missing' } }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/missing routine/)
  })
})
