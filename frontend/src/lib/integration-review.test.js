import { describe, expect, it } from 'vitest'
import { integrationChanges, sameIntegrationState } from './integration-review.js'

describe('integration review', () => {
  it('ignores timestamps and key ordering, but not training changes', () => {
    expect(sameIntegrationState({ a: 1, _ts: 1, b: [2] }, { b: [2], _ts: 3, a: 1 })).toBe(true)
    expect(sameIntegrationState({ a: 1 }, { a: 2 })).toBe(false)
  })
  it('shows complete before/after prescriptions, removals and dates', () => {
    const before = { routines: [{ id: 'a', name: 'Hang', ex: [{ id: 'x', sec: 5 }] }, { id: 'b', name: 'Old' }], dayPlan: { '2026-09-07': ['a'] } }
    const after = { routines: [{ id: 'a', name: 'Hang', ex: [{ id: 'x', sec: 10 }] }], dayPlan: { '2026-09-07': ['a', 'b'] } }
    const changes = integrationChanges(before, after)
    expect(changes).toHaveLength(3)
    expect(changes[0].before.ex[0].sec).toBe(5)
    expect(changes[0].after.ex[0].sec).toBe(10)
    expect(changes[1].after).toBeUndefined()
    expect(changes[2].label).toBe('2026-09-07')
  })
  it('never includes unrelated account or workout fields', () => {
    expect(integrationChanges({ workouts: [1], coach: {} }, { workouts: [], coach: null })).toEqual([])
  })
})
