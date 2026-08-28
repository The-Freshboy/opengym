import { describe, expect, it } from 'vitest'
import { applyReviewedPlan, compareReviewedBackup, restoreReviewedPlan, snapshotPlan, validateReviewedBackup } from './backup-review.js'

const routine = (id, name = id, ex = []) => ({ id, name, ex })
const state = over => ({ routines: [routine('a')], week: { 1: 'a' }, dayPlan: {}, customEx: [], exWeights: {}, workouts: [{ id: 'w1' }], bodyweight: [{ d: '2026-01-01', w: 80 }], theme: 'dark', ...over })

describe('reviewed backup imports', () => {
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
